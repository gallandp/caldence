<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { importEvents } from '../../core/edit';
  import { exportIcs } from '../../core/ics';
  import { parseIcs, reviewImport, unfoldBytes, type IcsEvent } from '../../core/icsImport';
  import { slug } from '../../core/slug';
  import { workspaceIndex, type Filter } from '../../core/views';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import { ruleSummary } from '../meetings/rules';
  import {
    browserFileEnv,
    exportTextFile,
    openTextFile,
    type FilePickerType,
  } from '../state/files';
  import { pickFile } from '../state/picker';
  import { activeTeamId, localToday, workspace } from '../state/workspace';

  let { onOpenMeetings }: { onOpenMeetings?: () => void } = $props();

  const uid = $props.id();
  const env = browserFileEnv((accept) => pickFile(accept ?? '.ics,text/calendar'));
  const types = (): FilePickerType[] => [
    { description: $t('exchange.file.type'), accept: { 'text/calendar': ['.ics'] } },
  ];

  const ws = $derived($workspace);
  const teams = $derived(ws.teams);

  let problem = $state<{ key: string; path?: string } | null>(null);
  let exported = $state<{ name: string; series: number; single: number } | null>(null);
  let imported = $state<{ n: number; team: string } | null>(null);

  // ---------- export ----------

  type ScopeKind = 'team' | 'role' | 'person';
  const scopeKinds: ScopeKind[] = ['team', 'role', 'person'];
  let kind = $state<ScopeKind>('team');
  let pickedId = $state<Record<ScopeKind, string | null>>({ team: null, role: null, person: null });
  let fromDraft = $state<string | null>(null);
  let toDraft = $state<string | null>(null);
  let reminder = $state('');
  let holidays = $state(false);
  let schoolHolidays = $state(false);
  let milestones = $state(false);
  const reminders = [5, 10, 15, 30];

  const choices = $derived(
    kind === 'team'
      ? ws.teams.map((x) => ({ id: x.id, name: x.name }))
      : kind === 'role'
        ? ws.roles.map((x) => ({ id: x.id, name: x.name }))
        : ws.people.map((x) => ({ id: x.id, name: x.name })),
  );
  const chosen = $derived(
    choices.find((c) => c.id === (pickedId[kind] ?? (kind === 'team' ? $activeTeamId : null))) ??
      choices[0],
  );
  const scope = $derived<Filter>(
    !chosen
      ? {}
      : kind === 'team'
        ? { teamId: chosen.id }
        : kind === 'role'
          ? { roleId: chosen.id }
          : { personId: chosen.id },
  );
  const from = $derived(fromDraft ?? ws.settings.horizon.from);
  const to = $derived(toDraft ?? ws.settings.horizon.to);
  const rangeInvalid = $derived(from === '' || to === '' || from > to);

  /** The file for the current form, or null while the form is invalid. Recomputed when it changes. */
  const built = $derived.by(() => {
    if (!chosen || rangeInvalid) return null;
    const range = { ...ws.settings, horizon: { from, to } };
    const text = exportIcs(ws, workspaceIndex({ ...ws, settings: range }), {
      scope,
      from,
      to,
      reminderMinutes: reminder === '' ? null : Number(reminder),
      allDay: { holidays, schoolHolidays, milestones },
      now: new Date(),
      locale: $locale,
    });
    let series = 0;
    let single = 0;
    // Folded continuation lines start with a space, so a line starting with RRULE: is a rule.
    for (const block of text.split('BEGIN:VEVENT\r\n').slice(1)) {
      if (
        block
          .split('END:VEVENT')[0]!
          .split('\r\n')
          .some((l) => l.startsWith('RRULE:'))
      )
        series++;
      else single++;
    }
    return { text, series, single };
  });
  const nothing = $derived(built !== null && built.series + built.single === 0);

  async function exportFile(event: SubmitEvent) {
    event.preventDefault();
    if (!built || !chosen || built.series + built.single === 0) return;
    try {
      const saved = await exportTextFile(
        env,
        `caldence-${slug(chosen.name)}.ics`,
        built.text,
        types(),
      );
      if (saved === null) return;
      problem = null;
      imported = null;
      exported = { name: saved, series: built.series, single: built.single };
    } catch {
      problem = { key: 'file.error.write' };
    }
  }

  // ---------- import ----------

  let fileName = $state('');
  let parsed = $state.raw<IcsEvent[] | null>(null);
  let teamDraft = $state<string | null>(null);
  let roleIds = $state<string[]>([]);
  // Per-row choices; a missing entry means the review's own default.
  let selection = $state<Record<string, boolean>>({});
  let categoryChoice = $state<Record<string, string>>({});
  let openButton = $state<HTMLButtonElement | undefined>();

  const importTeam = $derived(teams.find((x) => x.id === (teamDraft ?? $activeTeamId)) ?? teams[0]);
  const review = $derived(
    parsed && importTeam
      ? reviewImport(parsed, { ws, teamId: importTeam.id, today: localToday() })
      : null,
  );
  const rows = $derived(
    (review?.candidates ?? []).map((c) => ({
      c,
      on: selection[c.key] ?? c.selected,
      category: categoryChoice[c.key] ?? c.categoryHint ?? ws.categories[0]?.id ?? '',
    })),
  );
  const count = $derived(rows.filter((r) => r.on).length);

  async function chooseFile() {
    let file;
    try {
      file = await openTextFile(env, types(), unfoldBytes);
    } catch {
      problem = { key: 'file.error.read' };
      parsed = null;
      return;
    }
    if (!file) return;
    const result = parseIcs(file.text);
    if (!result.ok) {
      problem = { key: result.errors[0]?.key ?? 'ics.error.notIcs' };
      parsed = null;
      return;
    }
    problem = null;
    imported = null;
    fileName = file.name;
    selection = {};
    categoryChoice = {};
    roleIds = [];
    teamDraft = null;
    parsed = result.value;
  }

  function submitImport(event: SubmitEvent) {
    event.preventDefault();
    const team = importTeam;
    if (!team || count === 0) return;
    const items = rows.filter((r) => r.on).map((r) => ({ candidate: r.c, categoryId: r.category }));
    const result = workspace.apply((current) =>
      importEvents(current, team.id, items, {
        roleIds,
        newCategoryName: get(t)('exchange.newCategory'),
        untitledName: get(t)('import.untitled'),
      }),
    );
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      return;
    }
    problem = null;
    exported = null;
    imported = { n: items.length, team: team.name };
    parsed = null;
    // The form that was used is gone: move focus to the outcome.
    void tick().then(() => openButton?.focus());
  }

  const noteText = (n: { key: string; params: Record<string, unknown> }): string =>
    $t(
      n.key,
      n.key === 'import.note.ends'
        ? { date: formatDisplayDate($locale, n.params.date as string, 'long') }
        : (n.params as Record<string, string | number>),
    );
  const nameOf = (c: { name: string; untitled: boolean }) =>
    c.untitled || c.name.trim() === '' ? $t('import.untitled') : c.name;
</script>

<div class="exchange">
  <p class="help">{$t('exchange.help')}</p>

  <div role="status" class="notice">
    {#if imported}
      <span>{$t('exchange.imported', { n: imported.n, team: imported.team })}</span>
      <button type="button" bind:this={openButton} onclick={() => onOpenMeetings?.()}
        >{$t('exchange.open')}</button
      >
    {:else if exported}
      {$t('exchange.exported', {
        name: exported.name,
        series: exported.series,
        single: exported.single,
      })}
    {/if}
  </div>
  <div role="alert" class="error">
    {#if problem}{$t(problem.key, { path: problem.path ?? '' })}{/if}
  </div>

  <section aria-labelledby="{uid}-export-h">
    <h3 id="{uid}-export-h">{$t('exchange.export')}</h3>
    {#if teams.length === 0}
      <p class="empty">{$t('exchange.export.none')}</p>
    {/if}
    <form onsubmit={exportFile}>
      <div class="row">
        <fieldset>
          <legend>{$t('exchange.export.scope')}</legend>
          <div class="checks">
            {#each scopeKinds as k (k)}
              <label class="check">
                <input
                  type="radio"
                  name="{uid}-scope"
                  value={k}
                  checked={kind === k}
                  disabled={teams.length === 0}
                  onchange={() => (kind = k)}
                />
                {$t('exchange.scope.' + k)}
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="field">
          <label for="{uid}-scope-pick">{$t('exchange.scope.pick.' + kind)}</label>
          <select
            id="{uid}-scope-pick"
            disabled={choices.length === 0}
            value={chosen?.id ?? ''}
            onchange={(e) => (pickedId[kind] = e.currentTarget.value)}
          >
            {#each choices as choice (choice.id)}
              <option value={choice.id}>{choice.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="{uid}-from">{$t('exchange.export.from')}</label>
          <input
            id="{uid}-from"
            type="date"
            value={from}
            aria-invalid={rangeInvalid ? 'true' : undefined}
            aria-describedby={rangeInvalid ? `${uid}-range-err` : undefined}
            oninput={(e) => (fromDraft = e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label for="{uid}-to">{$t('exchange.export.to')}</label>
          <input
            id="{uid}-to"
            type="date"
            value={to}
            aria-invalid={rangeInvalid ? 'true' : undefined}
            aria-describedby={rangeInvalid ? `${uid}-range-err` : undefined}
            oninput={(e) => (toDraft = e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label for="{uid}-reminder">{$t('exchange.export.reminder')}</label>
          <select id="{uid}-reminder" bind:value={reminder}>
            <option value="">{$t('exchange.reminder.none')}</option>
            {#each reminders as n (n)}
              <option value={String(n)}>{$t('exchange.reminder.n', { n })}</option>
            {/each}
          </select>
        </div>
      </div>
      {#if rangeInvalid}
        <p class="field-error" id="{uid}-range-err">{$t('exchange.export.range')}</p>
      {/if}
      <fieldset>
        <legend>{$t('exchange.export.include')}</legend>
        <div class="checks">
          <label class="check"
            ><input type="checkbox" bind:checked={holidays} />
            {$t('exchange.include.holidays')}</label
          >
          <label class="check"
            ><input type="checkbox" bind:checked={schoolHolidays} />
            {$t('exchange.include.school')}</label
          >
          <label class="check"
            ><input type="checkbox" bind:checked={milestones} />
            {$t('exchange.include.milestones')}</label
          >
        </div>
      </fieldset>
      <div class="row">
        <button type="submit" disabled={built === null || nothing}
          >{$t('exchange.export.button')}</button
        >
      </div>
      {#if nothing}
        <p class="empty">{$t('exchange.export.empty')}</p>
      {/if}
    </form>
  </section>

  <section aria-labelledby="{uid}-import-h">
    <h3 id="{uid}-import-h">{$t('exchange.import')}</h3>
    {#if teams.length === 0}
      <p class="empty">{$t('exchange.import.none')}</p>
    {/if}
    <button type="button" disabled={teams.length === 0} onclick={chooseFile}
      >{$t('exchange.import.button')}</button
    >

    {#if review && importTeam}
      <form class="review" onsubmit={submitImport}>
        <div class="row">
          <div class="field">
            <label for="{uid}-team">{$t('exchange.import.team')}</label>
            <select
              id="{uid}-team"
              value={importTeam.id}
              onchange={(e) => {
                teamDraft = e.currentTarget.value;
                selection = {};
              }}
            >
              {#each teams as team (team.id)}
                <option value={team.id}>{team.name}</option>
              {/each}
            </select>
          </div>
        </div>
        <fieldset aria-describedby="{uid}-roles-hint">
          <legend>{$t('exchange.import.roles')}</legend>
          <div class="checks">
            {#each ws.roles as role (role.id)}
              <label class="check">
                <input type="checkbox" value={role.id} bind:group={roleIds} />
                {role.name}
              </label>
            {/each}
          </div>
          <p class="empty" id="{uid}-roles-hint">{$t('exchange.import.rolesHint')}</p>
        </fieldset>

        {#if rows.length === 0}
          <p class="empty">{$t('exchange.import.nothing')}</p>
        {:else}
          <div class="table-wrap">
            <table>
              <caption>{$t('exchange.table.caption', { file: fileName })}</caption>
              <thead>
                <tr>
                  <th scope="col" id="{uid}-h-on">{$t('exchange.col.import')}</th>
                  <th scope="col" id="{uid}-h-name">{$t('exchange.col.name')}</th>
                  <th scope="col" id="{uid}-h-rule">{$t('exchange.col.repeats')}</th>
                  <th scope="col" id="{uid}-h-time">{$t('exchange.col.time')}</th>
                  <th scope="col" id="{uid}-h-dur">{$t('exchange.col.duration')}</th>
                  <th scope="col" id="{uid}-h-cat">{$t('exchange.col.category')}</th>
                  <th scope="col" id="{uid}-h-notes">{$t('exchange.col.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {#each rows as row, i (row.c.key)}
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        aria-labelledby="{uid}-h-on {uid}-n-{i}"
                        checked={row.on}
                        onchange={(e) => (selection[row.c.key] = e.currentTarget.checked)}
                      />
                    </td>
                    <th scope="row" id="{uid}-n-{i}">{nameOf(row.c)}</th>
                    <td>{ruleSummary(row.c.rule, importTeam, $t, $locale)}</td>
                    <td>{row.c.time}</td>
                    <td>
                      {$t('meet.duration.fixed', { n: formatNumber($locale, row.c.duration, 0) })}
                    </td>
                    <td>
                      <select
                        aria-labelledby="{uid}-h-cat {uid}-n-{i}"
                        disabled={ws.categories.length === 0}
                        value={row.category}
                        onchange={(e) => (categoryChoice[row.c.key] = e.currentTarget.value)}
                      >
                        {#each ws.categories as category (category.id)}
                          <option value={category.id}>{category.name}</option>
                        {/each}
                      </select>
                    </td>
                    <td>
                      <ul class="notes">
                        {#if row.c.duplicateOf !== null}
                          <li>{$t('exchange.duplicate')}</li>
                        {/if}
                        {#each row.c.notes as note, j (j)}
                          <li>{noteText(note)}</li>
                        {/each}
                      </ul>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <p>
          {$t('exchange.summary', {
            n: count,
            skipped: review.skipped.length,
            hidden: review.hiddenPast,
          })}
        </p>
        {#if review.skipped.length > 0}
          <details>
            <summary>{$t('exchange.skipped')}</summary>
            <ul>
              {#each review.skipped as item, i (i)}
                <li>
                  {$t('exchange.skipped.item', {
                    summary:
                      item.summary.trim() === '' ? $t('exchange.skipped.untitled') : item.summary,
                    reason: $t('import.skip.' + item.reason),
                  })}
                </li>
              {/each}
            </ul>
          </details>
        {/if}
        <div class="row">
          <button type="submit" class="primary" disabled={count === 0}
            >{$t('exchange.import.submit', { n: count })}</button
          >
        </div>
      </form>
    {/if}
  </section>
</div>

<style>
  .exchange {
    max-width: 64rem;
  }
  .help,
  .empty {
    color: var(--text-muted);
  }
  section {
    margin-block: calc(var(--space) * 1.5);
  }
  h3 {
    margin-bottom: 0.5rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0.5rem 0;
    padding: 0.5rem 0.75rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 1rem;
    margin-block: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .notice {
    min-height: 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .error,
  .field-error {
    color: var(--danger);
  }
  .field-error {
    margin: 0.25rem 0 0;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.75rem 0.4rem 0;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody th {
    font-weight: 600;
  }
  .notes {
    margin: 0;
    padding-left: 1rem;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  input,
  select {
    max-width: 100%;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
  }
  input[type='checkbox'],
  input[type='radio'] {
    padding: 0;
  }
</style>
