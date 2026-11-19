<script lang="ts">
  import { untrack } from 'svelte';
  import {
    buildMatrix,
    cellPeople,
    type CellPerson,
    type MatrixColumn,
    type MatrixPerson,
    type MatrixWorld,
  } from '../../core/matrix';
  import { lineSelection, ORG_UNIT, orgName, selectedLineUnit } from '../../core/model';
  import { formatNumber, levels, locale, translate as t } from '../../i18n';
  import { presenting } from '../state/present';
  import { workspace } from '../state/workspace';

  /**
   * The matrix (#396): line teams × products with the committed FTE, the free FTE and the open
   * demand. The selection filters its own world's axis. A cell opens a small popover with who is
   * behind it and the way into the product or the line. While presenting: no names, no people.
   */
  interface Props {
    /** The selected unit: the organisation, a platform, a product, or a line unit. */
    selection: string;
    world: MatrixWorld;
    /** Opens a unit: a product id, or a line unit's selection. */
    onOpen: (selection: string) => void;
  }
  let { selection, world, onOpen }: Props = $props();

  /**
   * Above this many person cells the rows start folded, so a whole organisation of ~500 people
   * stays inside the performance budget (< 1 s at 4× CPU throttle); each row still unfolds.
   */
  const OPEN_CELLS_UP_TO = 3000;
  /** Open demand below this shows as covered: the matrix shows one decimal. */
  const EPS = 0.05;

  const uid = $props.id();
  const ws = $derived($workspace);
  const m = $derived(buildMatrix(ws, selection, world));
  const peopleCount = $derived(m.rows.reduce((n, r) => n + r.people.length, 0));

  /** null: follow "Personen zeigen"; otherwise the row's own choice. */
  let showPeople = $state<boolean | null>(null);
  const allOpen = $derived(showPeople ?? peopleCount * m.columns.length <= OPEN_CELLS_UP_TO);
  let opened = $state<Record<string, boolean>>({});
  const isOpen = (unitId: string) => !$presenting && (opened[unitId] ?? allOpen);
  function setAll(on: boolean) {
    showPeople = on;
    opened = {};
  }

  const name = $derived.by(() => {
    const line = selectedLineUnit(selection);
    if (selection === ORG_UNIT || line === ORG_UNIT) return orgName(ws, $levels.org);
    if (line !== undefined) return ws.lineUnits?.find((u) => u.id === line)?.name ?? '';
    return [...ws.areas, ...ws.teams].find((u) => u.id === selection)?.name ?? '';
  });

  const fte = (n: number) => formatNumber($locale, n, 1);
  /** −0,1 with a real minus sign. */
  const signed = (n: number) => (n < 0 ? '−' + fte(-n) : fte(n));

  // ---------- the popover ----------
  interface Pop {
    title: string;
    team: MatrixColumn['team'];
    people: CellPerson[];
    total: number;
    /** The row is a line unit (not "Ohne Linie"): one person can be opened in the line. */
    line: boolean;
  }
  let pop = $state<Pop | null>(null);
  let popEl: HTMLDivElement | undefined = $state();
  let anchor: HTMLElement | null = null;
  /** The cell whose popover is open, for its aria-expanded. */
  let openKey = $state<string | null>(null);
  /** A click on the open cell closes the popover (light dismiss) and must not reopen it. */
  let reopenBlocked = false;
  /** Runs before light dismiss (capture on the document), so it still sees the open popover. */
  function onDown(e: PointerEvent) {
    reopenBlocked = !!anchor && anchor === e.target && !!popEl?.matches(':popover-open');
  }

  // The popover is a snapshot: a change of the file or of presenting closes it.
  $effect(() => {
    void ws;
    void $presenting;
    untrack(() => {
      if (popEl?.matches(':popover-open')) popEl.hidePopover();
    });
  });

  function openPop(
    event: MouseEvent,
    rowName: string,
    people: MatrixPerson[],
    col: MatrixColumn,
    line: boolean,
  ) {
    const el = event.currentTarget as HTMLElement;
    if (reopenBlocked && el === anchor) {
      reopenBlocked = false;
      return;
    }
    anchor = el;
    openKey = `${rowName}/${col.team.id}`;
    const list = cellPeople(ws, { people }, col.team.id);
    pop = {
      title: $t('matrix.pop.title', { row: rowName, product: col.team.name }),
      team: col.team,
      people: list,
      total: list.reduce((s, p) => s + p.fte, 0),
      line,
    };
    queueMicrotask(place);
  }

  function place() {
    if (!popEl || !anchor) return;
    if (!popEl.matches(':popover-open')) popEl.showPopover();
    const r = anchor.getBoundingClientRect();
    const w = popEl.offsetWidth;
    const h = popEl.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const below = r.bottom + 6;
    const top = below + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    popEl.style.left = `${left}px`;
    popEl.style.top = `${top}px`;
    popEl.querySelector<HTMLElement>('button')?.focus();
  }

  function onToggle(e: ToggleEvent) {
    if (e.newState !== 'closed') return;
    pop = null;
    openKey = null;
    anchor?.focus();
  }

  function go(target: string) {
    popEl?.hidePopover();
    onOpen(target);
  }

  const lineOf = (personId: string) => ws.people.find((p) => p.id === personId)?.lineUnitId;
</script>

{#snippet cells(
  rowName: string,
  cells: Record<string, number>,
  people: MatrixPerson[],
  line: boolean,
)}
  {#each m.columns as col (col.team.id)}
    {@const v = cells[col.team.id]}
    {#if v !== undefined && v >= EPS}
      <td class="num" class:dim={col.dim}>
        <button
          type="button"
          class="cell"
          aria-haspopup="dialog"
          aria-expanded={openKey === `${rowName}/${col.team.id}`}
          aria-label={$t('matrix.cell', { fte: fte(v), row: rowName, product: col.team.name })}
          onclick={(e) => openPop(e, rowName, people, col, line)}>{fte(v)}</button
        >
      </td>
    {:else}
      <td class="num empty" class:dim={col.dim}></td>
    {/if}
  {/each}
{/snippet}

{#snippet free(n: number)}
  {#if n < 0}
    <span class="over">{signed(n)} <span class="over-text">{$t('line.overbooked')}</span></span>
  {:else}
    {fte(n)}
  {/if}
{/snippet}

<svelte:document onpointerdowncapture={onDown} />

<section class="matrix" aria-labelledby="{uid}-title">
  <header>
    <h2 id="{uid}-title" class="title">{$t('matrix.title')}</h2>
    <p class="subtitle">
      {world === 'line'
        ? $t('matrix.subtitle.line', { name, teams: $levels.teamsLc })
        : $t('matrix.subtitle.product', { name })}
    </p>
  </header>

  {#if m.rows.length === 0 && !m.noLine}
    <p class="empty-note">
      {(ws.lineUnits?.length ?? 0) === 0 ? $t('matrix.empty.noLine') : $t('matrix.empty.none')}
    </p>
  {:else}
    {#if !$presenting}
      <label class="toggle">
        <input
          type="checkbox"
          checked={allOpen}
          onchange={(e) => setAll(e.currentTarget.checked)}
        />
        {$t('matrix.people')}
      </label>
    {/if}

    <div class="scroll">
      <table>
        <caption class="sr-only">{$t('matrix.caption', { name })}</caption>
        <colgroup span="1"></colgroup>
        {#each m.groups as g (g.area?.id ?? '@loose')}<colgroup span={g.columns.length}
          ></colgroup>{/each}
        <colgroup span="1"></colgroup>
        <thead>
          <tr>
            <td class="corner" rowspan="2">
              <span aria-hidden="true">{$t('matrix.corner', { teams: $levels.teams })}</span>
            </td>
            {#each m.groups as g (g.area?.id ?? '@loose')}
              <th scope="colgroup" colspan={g.columns.length} class="group">
                {g.area?.name ?? $t('area.ungrouped')}
              </th>
            {/each}
            <th scope="col" rowspan="2" class="num free-head">{$t('matrix.free')}</th>
          </tr>
          <tr>
            {#each m.columns as col (col.team.id)}
              <th scope="col" class="product" class:dim={col.dim}>
                <button type="button" class="link" onclick={() => onOpen(col.team.id)}
                  >{col.team.name}</button
                >
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each m.rows as row (row.unit.id)}
            {@const open = isOpen(row.unit.id)}
            <tr class="unit">
              <th scope="row">
                <span class="row-head">
                  {#if !$presenting}
                    <button
                      type="button"
                      class="disclose"
                      aria-expanded={open}
                      aria-label={$t(open ? 'matrix.fold' : 'matrix.unfold', {
                        name: row.unit.name,
                      })}
                      onclick={() => (opened = { ...opened, [row.unit.id]: !open })}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" class:turned={open}
                        ><path d="M6 3.5 10.5 8 6 12.5" /></svg
                      >
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="link unit-name"
                    onclick={() => onOpen(lineSelection(row.unit.id))}>{row.unit.name}</button
                  >
                  {#if row.path.length > 0}
                    <!-- The line above; beyond two units only the direct one, the full path on
                         hover and for screen readers (#408). -->
                    {@const full = row.path.map((u) => u.name).join(' › ')}
                    {#if row.path.length > 2}
                      <span class="group-name" title={full}
                        ><span aria-hidden="true">… › {row.path.at(-1)!.name}</span><span
                          class="sr-only">{full}</span
                        ></span
                      >
                    {:else}
                      <span class="group-name">{full}</span>
                    {/if}
                  {/if}
                </span>
              </th>
              {@render cells(row.unit.name, row.cells, row.people, true)}
              <td class="num free">{@render free(row.free)}</td>
            </tr>
            {#if open}
              {#each row.people as p (p.person.id)}
                <tr class="person">
                  <th scope="row"><span class="person-name">{p.person.name}</span></th>
                  {@render cells(p.person.name, p.cells, [p], true)}
                  <td class="num">{@render free(p.free)}</td>
                </tr>
              {/each}
            {/if}
          {/each}
          {#if m.noLine}
            <tr class="unit no-line">
              <th scope="row">
                <span class="row-head"
                  ><span class="unit-name plain">{$t('matrix.noLine')}</span>
                  <span class="group-name">{$t('matrix.noLine.hint')}</span></span
                >
              </th>
              {@render cells($t('matrix.noLine'), m.noLine.cells, m.noLine.people, false)}
              <td class="num quiet">–</td>
            </tr>
          {/if}
        </tbody>
        {#if m.hasDemand}
          <tfoot>
            <tr class="open-row">
              <th scope="row">{$t('matrix.open')}</th>
              {#each m.columns as col (col.team.id)}
                <td class="num" class:dim={col.dim}>
                  {#if col.open === undefined}
                    <span class="quiet-dot" aria-hidden="true"></span>
                  {:else if col.open < EPS}
                    <span aria-hidden="true">✓</span><span class="sr-only"
                      >{$t('matrix.covered')}</span
                    >
                  {:else}
                    <strong>{fte(col.open)}</strong>
                  {/if}
                </td>
              {/each}
              <td></td>
            </tr>
          </tfoot>
        {/if}
      </table>
    </div>
    <p class="units">{$t('matrix.units')}</p>
  {/if}
</section>

<div
  bind:this={popEl}
  popover="auto"
  class="pop"
  role="dialog"
  aria-label={pop?.title}
  ontoggle={onToggle}
>
  {#if pop}
    <p class="pop-title">{pop.title}</p>
    <ul>
      {#each pop.people as p (p.personId)}
        <li>
          {#if !$presenting}<span class="pop-name">{p.name}</span>{/if}
          <span class="pop-skill">{p.skill ?? ''}</span>
          <span class="pop-fte">{$t('line.fte', { fte: fte(p.fte) })}</span>
        </li>
      {/each}
    </ul>
    {#if pop.people.length > 1}
      <p class="pop-sum">{$t('matrix.pop.sum', { fte: fte(pop.total), n: pop.people.length })}</p>
    {/if}
    <div class="pop-actions">
      <button type="button" class="secondary" onclick={() => go(pop!.team.id)}
        >{$t('matrix.pop.openProduct', { product: pop.team.name })}</button
      >
      {#if pop.line && pop.people.length === 1 && !$presenting}
        {@const person = pop.people[0]!}
        {@const unit = lineOf(person.personId)}
        {#if unit}
          <button type="button" class="secondary" onclick={() => go(lineSelection(unit))}
            >{$t('matrix.pop.inLine', { name: person.name })}</button
          >
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .matrix {
    /* Its width comes from the page, never from the table: wide tables scroll in their box. */
    contain: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }
  .title {
    margin: 0;
    font-size: 1.25rem;
  }
  .subtitle,
  .units,
  .empty-note {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
  }
  .units {
    font-size: 0.85rem;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
  }
  /* The table scrolls in its own box; the page never scrolls sideways (390 px). */
  .scroll {
    /* The containing block of the hidden screen-reader texts, so they scroll and clip too. */
    position: relative;
    max-width: 100%;
    max-height: min(75vh, 56rem);
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.925rem;
    min-width: 100%;
  }
  th,
  td {
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--border);
    font-weight: 400;
    text-align: start;
    white-space: nowrap;
  }
  /* Header and the open demand stay in view while the rows scroll. */
  thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }
  tfoot {
    position: sticky;
    bottom: 0;
    z-index: 2;
  }
  thead th,
  thead td {
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 650;
  }
  th.group {
    text-align: center;
    border-left: 1px solid var(--border);
  }
  /* The first column stays in view while the products scroll. */
  tbody th,
  tfoot th,
  .corner {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--surface);
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .corner {
    z-index: 3;
    background: var(--surface-2);
    vertical-align: bottom;
  }
  .num {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .free-head,
  td.free {
    font-weight: 700;
    color: var(--text);
  }
  tr.unit > th,
  tr.unit > td {
    background: var(--surface-2);
  }
  tr.unit > th {
    font-weight: 600;
  }
  .row-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* The sticky first column leaves room for the products on a phone. */
  .row-head,
  .person-name {
    max-width: min(18rem, 45vw);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .person-name {
    display: block;
  }
  @media (max-width: 40rem) {
    .group-name {
      display: none;
    }
    .person-name {
      padding-left: 0.5rem;
    }
  }
  .group-name {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 500;
  }
  .person-name {
    padding-left: 2.6rem;
  }
  :global(#app) .matrix button.link {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  :global(#app) .matrix button.unit-name {
    color: var(--line);
  }
  .unit-name.plain {
    color: var(--text-muted);
  }
  :global(#app) .matrix button.disclose {
    display: grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
  }
  .disclose svg {
    width: 0.9rem;
    height: 0.9rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s ease;
  }
  .disclose svg.turned {
    transform: rotate(90deg);
  }
  :global(#app) .matrix button.cell {
    min-width: 3rem;
    min-height: 2rem;
    padding: 0.15rem 0.6rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  :global(#app) .matrix button.cell:hover {
    background: var(--accent);
    color: var(--on-accent);
  }
  /* An empty cell is a quiet dot (CSS only: thousands of cells stay cheap). */
  td.empty::after,
  .quiet-dot::after {
    content: '·' / '';
    color: var(--text-muted);
    opacity: 0.6;
  }
  .quiet {
    color: var(--text-muted);
  }
  .dim {
    opacity: 0.55;
  }
  .over {
    display: inline-flex;
    gap: 0.3rem;
    align-items: baseline;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-weight: 700;
  }
  .over-text {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .open-row th,
  .open-row td {
    background: var(--warn-soft);
    color: var(--warn);
    font-weight: 700;
    border-bottom: 0;
  }
  .open-row th {
    color: var(--text);
  }
  .pop {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(22rem, calc(100vw - 1rem));
    padding: 0.85rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lg);
  }
  .pop-title {
    margin: 0 0 0.5rem;
    font-weight: 700;
  }
  .pop ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pop li {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--border);
  }
  .pop-name {
    font-weight: 600;
  }
  .pop-skill {
    flex: 1;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .pop-fte {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pop-sum {
    margin: 0.4rem 0 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .pop-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  @media (forced-colors: active) {
    .open-row th,
    .open-row td,
    .over {
      border: 1px solid CanvasText;
    }
  }
</style>
