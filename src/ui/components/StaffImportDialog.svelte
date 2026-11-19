<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    COLUMNS,
    parseCsv,
    reviewStaff,
    staffTable,
    staffTemplateCsv,
    staffTemplateSheets,
    type Choice,
    type Column,
    type Note,
    type RowResult,
    type StaffTable,
    type TemplateText,
  } from '../../core/staffImport';
  import { readXlsx } from '../../core/xlsxRead';
  import { xlsx } from '../../core/xlsx';
  import { LIMITS } from '../../core/limits';
  import { validate } from '../../core/validate';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { browserFileEnv, exportTextFile } from '../state/files';
  import { workspace } from '../state/workspace';

  let {
    open,
    onclose,
    ondone,
    onprivacy,
  }: {
    open: boolean;
    onclose: () => void;
    /** After the import: how many people were taken over, and whether the file changed. */
    ondone: (n: number, changed: boolean) => void;
    /** Opens the help on privacy (the dialog closes first). */
    onprivacy?: () => void;
  } = $props();

  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined;
  let input: HTMLInputElement | undefined;
  let chooseButton = $state<HTMLButtonElement | undefined>();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const ws = $derived($workspace);

  let fileName = $state('');
  let table = $state.raw<StaffTable | null>(null);
  let problem = $state<string | null>(null);
  let choices = $state<Record<number, Choice>>({});
  let onlyHints = $state(false);
  let copied = $state(false);
  let busy = $state(false);

  function reset() {
    fileName = '';
    table = null;
    problem = null;
    choices = {};
    onlyHints = false;
    copied = false;
  }

  function close() {
    reset();
    onclose();
  }

  const headers = (): Record<Column, string> =>
    Object.fromEntries(COLUMNS.map((c) => [c, $t('staff.head.' + c)])) as Record<Column, string>;

  // Header names in both languages plus the file's own line level names.
  const extraHeaders = $derived.by(() => {
    const own = ws.settings.lineLevelNames;
    return { team: own ? [own.team] : [], group: own ? [own.group] : [] };
  });

  const review = $derived(
    table && table.missing.length === 0 && table.rows.length > 0
      ? reviewStaff(ws, table, choices, { family: (name) => $t('staff.family', { name }) })
      : null,
  );
  const taken = $derived(
    review ? review.counts.new + review.counts.updated + review.counts.unchanged : 0,
  );
  // The preview runs the file's own checks, so a refused import shows here and not on submit.
  const invalid = $derived.by(() => {
    if (!review || review.limits.length > 0) return null;
    const v = validate(review.ws);
    return v.ok ? null : (v.errors[0] ?? null);
  });
  const invalidText = $derived(
    invalid ? $t('staff.error.invalid', { reason: $t(invalid.key, { path: invalid.path }) }) : '',
  );
  // Only unchanged rows change nothing: there is nothing to take over (and nothing to undo).
  const blocked = $derived(
    !review ||
      review.counts.choose > 0 ||
      review.limits.length > 0 ||
      invalid !== null ||
      review.counts.new + review.counts.updated === 0,
  );
  const chips = $derived.by(() => {
    if (!review) return [];
    const c = review.counts;
    const list: { cls: string; text: string; n: number }[] = [
      { cls: 'ok', n: c.new, text: $t('staff.count.new', { n: c.new }) },
      { cls: '', n: c.unchanged, text: $t('staff.count.unchanged', { n: c.unchanged }) },
      { cls: 'accent', n: c.updated, text: $t('staff.count.updated', { n: c.updated }) },
      {
        cls: 'warn',
        n: review.created.skills.length,
        text: count('skills', review.created.skills.length),
      },
      {
        cls: 'warn',
        n: review.created.companies.length,
        text: count('companies', review.created.companies.length),
      },
      {
        cls: 'warn',
        n: review.created.units.length,
        text: count('units', review.created.units.length),
      },
      { cls: 'warn', n: c.choose, text: $t('staff.count.choose', { n: c.choose }) },
      { cls: '', n: c.skipped, text: $t('staff.count.skipped', { n: c.skipped }) },
      { cls: 'danger', n: c.error, text: count('error', c.error) },
    ];
    return list.filter((x) => x.n > 0);
  });
  /** Open choices where exactly one person is offered, for the bulk buttons. */
  const openRows = $derived((review?.rows ?? []).filter((r) => r.status === 'choose'));
  const singleCandidate = $derived(openRows.filter((r) => r.candidates.length === 1));
  const shown = $derived(
    (review?.rows ?? []).filter(
      (r) => !onlyHints || r.status === 'error' || r.status === 'choose' || r.notes.length > 0,
    ),
  );
  const errorRows = $derived((review?.rows ?? []).filter((r) => r.status === 'error'));

  /** Larger files are refused before reading: 1000 people fit in far less. */
  const MAX_FILE = 10 * 1024 * 1024;
  let readToken = 0;

  /** CSV text: UTF-8, or Windows-1252 as German Excel writes plain "CSV (Trennzeichen-getrennt)". */
  function decode(bytes: Uint8Array): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }

  async function readFile(file: File) {
    if (busy) return;
    reset();
    const token = ++readToken;
    fileName = file.name;
    if (file.size > MAX_FILE) {
      problem = $t('staff.error.tooLarge');
      return;
    }
    busy = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== readToken) return;
      let cells;
      // An .xlsx is a zip ("PK"); anything else is read as CSV text.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        // A little room for empty rows above and between the people.
        const read = await readXlsx(
          bytes,
          [$t('staff.sheet'), 'Personal', 'Staff'],
          2 * LIMITS.people,
        );
        if (!read) throw new Error('unreadable');
        if (read.tooMany) {
          problem = $t('staff.error.tooMany', { n: LIMITS.people });
          return;
        }
        cells = read.rows;
      } else {
        cells = parseCsv(decode(bytes), 2 * LIMITS.people + 1);
        if (cells.length > 2 * LIMITS.people) {
          problem = $t('staff.error.tooMany', { n: LIMITS.people });
          return;
        }
      }
      const parsed = staffTable(cells, extraHeaders);
      if (parsed.rows.length > LIMITS.people) {
        problem = $t('staff.error.tooMany', { n: LIMITS.people });
        return;
      }
      if (parsed.missing.length > 0)
        problem = $t('staff.error.missing', {
          columns: parsed.missing.map((c) => $t('staff.head.' + c)).join(', '),
        });
      else if (parsed.rows.length === 0) problem = $t('staff.error.empty');
      table = parsed;
    } catch {
      problem = $t('staff.error.read');
      table = null;
    } finally {
      busy = false;
    }
  }

  function onFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) void readFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void readFile(file);
  }

  const env = browserFileEnv(() => Promise.resolve(null));
  const templateText = (): TemplateText => ({
    headers: headers(),
    sheet: $t('staff.sheet'),
    exampleSheet: $t('staff.sheet.example'),
  });

  async function saveTemplate(kind: 'xlsx' | 'csv') {
    const base = $t('staff.file');
    try {
      if (kind === 'xlsx')
        await exportTextFile(
          env,
          `${base}.xlsx`,
          xlsx(staffTemplateSheets(templateText()), new Date()),
          [
            {
              description: $t('exchange.xlsx.type'),
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              },
            },
          ],
        );
      else
        await exportTextFile(
          env,
          `${base}.csv`,
          // A byte order mark so Excel reads the umlauts as UTF-8.
          '\uFEFF' + staffTemplateCsv(templateText(), $locale === 'de' ? ';' : ','),
          [{ description: $t('staff.type.csv'), accept: { 'text/csv': ['.csv'] } }],
        );
    } catch {
      problem = $t('file.error.write');
    }
  }

  function choiceValue(row: RowResult): string {
    const c = choices[row.row.line];
    return !c ? '' : c.kind === 'person' ? `p:${c.personId}` : c.kind;
  }

  function chooseAll(kind: 'person' | 'new') {
    const next = { ...choices };
    for (const r of kind === 'person' ? singleCandidate : openRows)
      next[r.row.line] =
        kind === 'person' ? { kind: 'person', personId: r.candidates[0]!.id } : { kind: 'new' };
    choices = next;
    copied = false;
  }

  function choose(line: number, value: string) {
    copied = false;
    const next = { ...choices };
    if (value === '') delete next[line];
    else if (value.startsWith('p:')) next[line] = { kind: 'person', personId: value.slice(2) };
    else next[line] = { kind: value as 'new' | 'skip' };
    choices = next;
  }

  /** A count chip, with its own text for one. */
  const count = (key: string, n: number) =>
    $t(n === 1 ? `staff.count.${key}.one` : `staff.count.${key}`, { n });
  const fte = (n: number) => formatNumber($locale, n, 1);
  const unitName = (id: string | undefined) =>
    ws.lineUnits?.find((u) => u.id === id)?.name ?? $t('staff.noUnit');

  function noteText(n: Note): string {
    if (n.key === 'fte') return $t('staff.note.fte', { from: fte(n.from) });
    if (n.key === 'skills') return $t('staff.note.skills');
    return $t('staff.note.' + n.key, { name: n.name });
  }

  function errorText(r: RowResult): string {
    const name = r.row.group !== '' ? r.row.group : r.row.team;
    return $t('staff.error.' + r.error, { name });
  }

  async function copyErrors() {
    const text = errorRows
      .map((r) =>
        $t('staff.errors.line', {
          line: r.row.line,
          name: r.row.name || '–',
          reason: errorText(r),
        }),
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      problem = $t('staff.errors.copyFailed');
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!review || blocked) return;
    const next = review.ws;
    const before = get(workspace);
    const result = workspace.apply(() => next);
    if (!result.ok) {
      const first = result.errors[0];
      problem = get(t)(first?.key ?? 'error.type', { path: first?.path ?? '' });
      return;
    }
    const n = taken;
    reset();
    ondone(n, get(workspace) !== before);
  }

  // Escape closes like Abbrechen.
  function onCancel(event: Event) {
    event.preventDefault();
    close();
  }

  /** The columns line with the column names set as code. */
  const columnsParts = $derived(
    $t('staff.columns')
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        return m && (COLUMNS as string[]).includes(m[1]!)
          ? { code: $t('staff.head.' + m[1]) }
          : { text: part };
      }),
  );

  $effect(() => {
    if (open) void tick().then(() => chooseButton?.focus());
  });
</script>

<dialog
  bind:this={dialog}
  oncancel={onCancel}
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-intro"
  class="staff-import"
>
  <form method="dialog" onsubmit={submit}>
    <p class="kicker">{$t('staff.eyebrow')}</p>
    <h2 id="{uid}-title">{$t('staff.title')}</h2>
    <p id="{uid}-intro">{$t('staff.intro')}</p>

    <div class="info">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"
        ><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" /><path
          d="M12 11v6M12 7.5v.01"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        /></svg
      >
      <div>
        <p>
          {#each columnsParts as part, i (i)}{#if 'code' in part}<code>{part.code}</code
              >{:else}{part.text}{/if}{/each}
        </p>
        <div class="templates">
          <button type="button" onclick={() => saveTemplate('xlsx')}
            >{$t('staff.template.xlsx')}</button
          >
          <button type="button" onclick={() => saveTemplate('csv')}
            >{$t('staff.template.csv')}</button
          >
        </div>
      </div>
    </div>

    <p class="privacy">
      {$t('staff.privacy')}
      <button
        type="button"
        class="link"
        onclick={() => {
          close();
          onprivacy?.();
        }}>{$t('staff.privacy.link')}</button
      >
    </p>

    <div
      class="drop"
      role="group"
      aria-labelledby="{uid}-file"
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
    >
      <input
        bind:this={input}
        type="file"
        hidden
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onchange={onFile}
      />
      {#if fileName}
        <p class="file" id="{uid}-file">
          <strong>{fileName}</strong>
          {#if table && !problem}
            <span
              >{$t(table.rows.length === 1 ? 'staff.read.one' : 'staff.read', {
                n: table.rows.length,
              })}</span
            >
          {/if}
        </p>
      {:else}
        <p class="file" id="{uid}-file"><span>{$t('staff.drop')}</span></p>
      {/if}
      <button type="button" bind:this={chooseButton} disabled={busy} onclick={() => input?.click()}
        >{$t(fileName ? 'staff.chooseOther' : 'staff.choose')}</button
      >
    </div>

    <div role="alert" class="error">{problem ?? ''}</div>
    <!-- Announces the result of reading a file; the chips below show it. -->
    <p role="status" class="visually-hidden">
      {review
        ? [
            $t(table?.rows.length === 1 ? 'staff.read.one' : 'staff.read', {
              n: table?.rows.length ?? 0,
            }),
            ...chips.map((c) => c.text),
          ].join(', ')
        : ''}
    </p>

    {#if table && table.ignored.length > 0}
      <p class="ignored">
        {$t('staff.ignored', { columns: table.ignored.join(', ') })}
      </p>
    {/if}

    {#if review}
      <ul class="chips" aria-label={$t('staff.summary')}>
        {#each chips as chip (chip.text)}<li class={chip.cls}>{chip.text}</li>{/each}
      </ul>

      {#each review.limits as limit (limit)}
        <p class="error">{$t('staff.limit.' + limit, { n: LIMITS[limit] })}</p>
      {/each}
      {#if invalidText}
        <p class="error">{invalidText}</p>
      {/if}
      {#if review.counts.choose > 0}
        <p class="hint">{$t('staff.choose.hint')}</p>
        <div class="tools">
          {#if singleCandidate.length > 0}
            <button type="button" onclick={() => chooseAll('person')}
              >{$t('staff.bulk.person', { n: singleCandidate.length })}</button
            >
          {/if}
          <button type="button" onclick={() => chooseAll('new')}
            >{$t('staff.bulk.new', { n: openRows.length })}</button
          >
        </div>
      {/if}

      <div class="tools">
        <label class="check"
          ><input type="checkbox" bind:checked={onlyHints} /> {$t('staff.onlyHints')}</label
        >
        {#if errorRows.length > 0}
          <button type="button" onclick={copyErrors}>{$t('staff.errors.copy')}</button>
          <span role="status">{copied ? $t('staff.errors.copied') : ''}</span>
        {/if}
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
      <div class="table-wrap" role="region" aria-labelledby="{uid}-caption" tabindex="0">
        <table>
          <caption id="{uid}-caption" class="visually-hidden"
            >{$t('staff.caption', { file: fileName })}</caption
          >
          <thead>
            <tr>
              <th scope="col" class="line">{$t('staff.col.line')}</th>
              <th scope="col">{$t('staff.head.name')}</th>
              <th scope="col" class="wide">{$t('staff.head.team')}</th>
              <th scope="col" class="num wide">{$t('staff.col.fte')}</th>
              <th scope="col" class="skills">{$t('staff.head.skills')}</th>
              <th scope="col" id="{uid}-h-result">{$t('staff.col.result')}</th>
            </tr>
          </thead>
          <tbody>
            {#each shown as r (r.row.line)}
              <tr>
                <td class="line">{r.row.line}</td>
                <th scope="row" id="{uid}-n-{r.row.line}">
                  {r.row.name || '–'}
                  <!-- Phones show team and FTE under the name instead of in their columns. -->
                  <span class="sub phone"
                    >{r.row.team} · {r.row.fte === null ? r.row.fteText : fte(r.row.fte)}</span
                  >
                </th>
                <td class="wide">
                  {r.row.team}
                  {#if r.row.group}<span class="sub">{r.row.group}</span>{/if}
                  {#if r.row.company}<span class="sub">{r.row.company}</span>{/if}
                </td>
                <td class="num wide">{r.row.fte === null ? r.row.fteText : fte(r.row.fte)}</td>
                <td class="skills">{r.row.skills.join('; ')}</td>
                <td>
                  {#if r.conflict !== undefined}
                    <select
                      aria-labelledby="{uid}-h-result {uid}-n-{r.row.line}"
                      value={choiceValue(r)}
                      onchange={(e) => choose(r.row.line, e.currentTarget.value)}
                    >
                      <option value="">{$t('staff.choice.pick')}</option>
                      {#each r.candidates as p (p.id)}
                        <option value="p:{p.id}"
                          >{$t('staff.choice.person', {
                            name: p.name,
                            unit: unitName(p.lineUnitId),
                            fte: fte(p.contractFte ?? 1),
                          })}</option
                        >
                      {/each}
                      <option value="new">{$t('staff.choice.new')}</option>
                      <option value="skip">{$t('staff.choice.skip')}</option>
                    </select>
                  {/if}
                  {#if r.status === 'error'}
                    <span class="tag danger">{errorText(r)}</span>
                  {:else if r.status !== 'choose'}
                    <span class="tag {r.status}">{$t('staff.status.' + r.status)}</span>
                    {#each r.notes as n, j (j)}
                      <span class="tag {n.key.startsWith('new') ? 'warn' : 'note'}"
                        >{noteText(n)}</span
                      >
                    {/each}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <p class="match">{$t('staff.match')}</p>

    <div class="actions">
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
      <button type="submit" class="primary" disabled={blocked}
        >{$t(taken === 1 ? 'staff.submit.one' : 'staff.submit', { n: taken })}</button
      >
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(60rem, calc(100vw - 2 * var(--space)));
    max-height: calc(100dvh - 2 * var(--space));
    padding: 0;
    background: var(--surface, var(--bg));
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, var(--radius));
    box-shadow: var(--shadow-lg, none);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  form {
    padding: calc(var(--space) * 1.5);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  form > p,
  .info p {
    margin: 0;
  }
  .kicker {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  h2 {
    margin: -0.5rem 0 0;
    font-size: 1.375rem;
  }
  .info {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .info svg {
    flex: none;
    color: var(--accent-text, var(--accent));
    margin-top: 0.1rem;
  }
  code {
    font-size: 0.9em;
    padding: 0.05rem 0.35rem;
    border-radius: 0.3rem;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .templates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .privacy,
  .match,
  .hint,
  .ignored,
  .kicker {
    color: var(--text-muted);
  }
  .drop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border: 1.5px dashed var(--border-strong, var(--border));
    border-radius: var(--radius-lg, var(--radius));
  }
  .file {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .file span {
    color: var(--text-muted);
  }
  .error {
    color: var(--danger);
  }
  .error:empty {
    display: none;
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .chips li,
  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--surface-2, var(--border));
    font-weight: 600;
    font-size: 0.875rem;
  }
  .tag {
    border-radius: 0.5rem;
    font-weight: 500;
    margin: 0.1rem 0.25rem 0.1rem 0;
  }
  .ok,
  .tag.new {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .accent,
  .tag.updated {
    background: var(--accent-soft);
    color: var(--accent-text, var(--accent));
  }
  .warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .danger {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .tag.note,
  .tag.unchanged,
  .tag.skipped {
    color: var(--text-muted);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .table-wrap {
    overflow: auto;
    max-height: min(26rem, 45dvh);
    border-top: 1px solid var(--border);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface, var(--bg));
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.875rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.75rem 0.5rem 0;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody th {
    font-weight: 600;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .line {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .sub {
    display: block;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .skills {
    font-size: 0.9375rem;
    max-width: 16rem;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* The actions stay in reach while the preview scrolls. */
  .actions {
    position: sticky;
    bottom: 0;
    margin: 0 calc(var(--space) * -1.5) calc(var(--space) * -1.5);
    padding: 0.875rem calc(var(--space) * 1.5);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    background: var(--surface, var(--bg));
    border-top: 1px solid var(--border);
  }
  select {
    max-width: 100%;
    margin-bottom: 0.25rem;
  }
  :global(#app) button.link {
    border: none;
    background: none;
    box-shadow: none;
    padding: 0;
    font-size: inherit;
    font-weight: 500;
    color: var(--accent-text, var(--accent));
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  tbody th {
    min-width: 8rem;
  }
  .sub.phone {
    display: none;
  }
  @media (max-width: 40rem) {
    form {
      padding: var(--space);
    }
    .actions {
      margin: 0 calc(var(--space) * -1) calc(var(--space) * -1);
      padding: 0.75rem var(--space);
    }
    .skills,
    .line,
    .wide {
      display: none;
    }
    table {
      table-layout: fixed;
    }
    tbody th,
    thead th:nth-child(2) {
      width: 42%;
      min-width: 0;
    }
    td,
    .tag {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .sub.phone {
      display: block;
      font-weight: 400;
    }
    .actions > :global(button) {
      flex: 1 1 auto;
    }
  }
</style>
