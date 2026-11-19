<script lang="ts">
  import { tick } from 'svelte';
  import { hasHint, personCompanyId, type StaffRow } from '../../core/lineStaff';
  import { lineRootName, ORG_UNIT, units, type LineUnit } from '../../core/model';
  import { formatNumber, levels, locale, translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import { workspace } from '../state/workspace';
  import { PRODUCT_COLOURS } from '../productColours';
  import LinePersonAdd from './LinePersonAdd.svelte';
  import LinePersonDetail from './LinePersonDetail.svelte';
  import SkillsDialog from './SkillsDialog.svelte';
  import UnitChip from './UnitChip.svelte';

  /**
   * The people of a line unit (#316): search by name or skill, sort, filter by company, and per
   * person skills, contract, what they are committed to, what is free and hints. 500 people stay
   * quick: the first rows show at once, the rest on request.
   */
  let {
    rows,
    unit,
    lineColumn = false,
  }: { rows: StaffRow[]; unit: LineUnit; lineColumn?: boolean } = $props();
  const uid = $props.id();

  const ws = $derived($workspace);
  const skillName = $derived(new Map((ws.skills ?? []).map((s) => [s.id, s.name])));
  const companies = $derived(ws.companies ?? []);
  const companyName = $derived(new Map(companies.map((c) => [c.id, c.name])));
  const unitName = $derived(
    new Map([
      [ORG_UNIT, lineRootName(ws, $levels.org)],
      ...(ws.lineUnits ?? []).map((u) => [u.id, u.name] as const),
    ]),
  );
  /** The company filter and column only when the file has several companies. */
  const several = $derived(companies.length > 1);

  let query = $state('');
  let sort = $state<'name' | 'free' | 'hints'>('name');
  let company = $state('');
  let showAll = $state(false);
  let open = $state<string | null>(null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase($locale);
    return rows.filter((r) => {
      if (company && personCompanyId(ws, r.person) !== company) return false;
      if (!q) return true;
      if (r.person.name.toLocaleLowerCase($locale).includes(q)) return true;
      return (r.person.skillIds ?? []).some((id) =>
        (skillName.get(id) ?? '').toLocaleLowerCase($locale).includes(q),
      );
    });
  });
  const hintCount = (r: StaffRow) =>
    (r.free < 0 ? 1 : 0) + (r.overLimit ? 1 : 0) + (r.context ? 1 : 0);
  const sorted = $derived.by(() => {
    const byName = (a: StaffRow, b: StaffRow) =>
      a.person.name.localeCompare(b.person.name, $locale);
    const list = [...filtered];
    if (sort === 'name') return list.sort(byName);
    if (sort === 'free') return list.sort((a, b) => b.free - a.free || byName(a, b));
    return list.sort((a, b) => hintCount(b) - hintCount(a) || a.free - b.free || byName(a, b));
  });
  /** A big line (#315: ~500 people) shows its first rows at once and the rest on request. */
  const ROWS = 150;
  const shown = $derived(showAll ? sorted : sorted.slice(0, ROWS));
  // A company that is gone (or the only one left) must not keep hiding everyone.
  $effect(() => {
    if (company !== '' && (!several || !companies.some((c) => c.id === company))) company = '';
  });
  // A person who left the list (another unit, a filter) does not stay opened.
  $effect(() => {
    if (open !== null && !filtered.some((r) => r.person.id === open)) open = null;
  });

  const fte = (n: number) => formatNumber($locale, n, 1);
  /** Bar colours per commitment, in order; the label says the same in text. */
  /** One colour per team or area, the same in every row and in the calendar. */
  const colourAt = $derived(
    new Map(units(ws).map((u, i) => [u.id, PRODUCT_COLOURS[i % PRODUCT_COLOURS.length]])),
  );
  const colourOf = (unitId: string) => colourAt.get(unitId);
  const barScale = (r: StaffRow) =>
    Math.max(
      r.contract,
      r.commitments.reduce((n, c) => n + c.fte, 0),
      0.01,
    );

  async function addSkill(personId: string) {
    open = personId;
    await tick();
    document.getElementById(`${uid}-${personId}-skill`)?.focus();
  }

  let skills: SkillsDialog | undefined = $state();
  let adder: LinePersonAdd | undefined = $state();
  let skillsButton: HTMLButtonElement | undefined = $state();
  let addButton: HTMLButtonElement | undefined = $state();
  const columns = $derived(lineColumn ? 8 : 7);
</script>

<div class="staff">
  <div class="tools">
    <div class="field search">
      <label class="sr-only" for="{uid}-q">{$t('line.search')}</label>
      <input
        id="{uid}-q"
        type="search"
        placeholder={$t('line.search')}
        bind:value={query}
        autocomplete="off"
      />
    </div>
    <div class="field inline">
      <label for="{uid}-sort">{$t('line.sort')}</label>
      <select id="{uid}-sort" bind:value={sort}>
        <option value="name">{$t('line.sort.name')}</option>
        <option value="free">{$t('line.sort.free')}</option>
        <option value="hints">{$t('line.sort.hints')}</option>
      </select>
    </div>
    {#if several}
      <div class="field inline">
        <label for="{uid}-company">{$t('line.company')}</label>
        <select id="{uid}-company" bind:value={company}>
          <option value="">{$t('filter.all')}</option>
          {#each companies as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
    {/if}
    <p class="count" role="status">
      {[
        $t('line.count', { n: filtered.length, m: rows.length }),
        shown.length < sorted.length ? $t('line.count.first', { n: shown.length }) : '',
      ]
        .filter(Boolean)
        .join(' ')}
    </p>
    <div class="actions">
      <button type="button" bind:this={addButton} onclick={() => adder?.show()}
        >{$t('line.person.add')}</button
      >
      <button
        type="button"
        bind:this={skillsButton}
        onclick={() => skills?.show(unit.skillFamilyId)}>{$t('line.skills.manage')}</button
      >
    </div>
  </div>

  <div class="scroll" tabindex="-1">
    <table>
      <caption class="sr-only">{$t('line.table.caption', { name: unit.name })}</caption>
      <thead>
        <tr>
          <th scope="col">{$t('line.col.person')}</th>
          {#if lineColumn}<th scope="col">{$levels.lineTeam}</th>{/if}
          <th scope="col">{$t('line.col.skills')}</th>
          <th scope="col" class="num">{$t('line.col.contract')}</th>
          <th scope="col">{$t('line.col.committed', { teams: $levels.teams })}</th>
          <th scope="col" class="num">{$t('line.col.free')}</th>
          <th scope="col">{$t('line.col.hints')}</th>
          <th scope="col"><span class="sr-only">{$t('line.col.details')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each shown as r (r.person.id)}
          {@const id = r.person.id}
          {@const scale = barScale(r)}
          <tr class:opened={open === id} class:hinted={hasHint(r)}>
            <th scope="row">
              <span class="person">
                <span class="avatar" aria-hidden="true">{initials(r.person.name)}</span>
                <span class="who">
                  <span class="name">{r.person.name}</span>
                  {#if several && personCompanyId(ws, r.person)}
                    <span class="company">{companyName.get(personCompanyId(ws, r.person)!)}</span>
                  {/if}
                </span>
              </span>
            </th>
            {#if lineColumn}
              <td class="unit">{unitName.get(r.person.lineUnitId ?? '') ?? ''}</td>
            {/if}
            <td class="skills">
              <span class="chips">
                {#each r.person.skillIds ?? [] as s (s)}
                  <span class="chip">{skillName.get(s)}</span>
                {/each}
                <button
                  type="button"
                  class="chip add"
                  aria-label={$t('line.skill.addFor', { name: r.person.name })}
                  onclick={() => addSkill(id)}>+</button
                >
              </span>
            </td>
            <td class="num contract"
              ><span class="m-label">{$t('line.col.contract')}</span>{fte(r.contract)}</td
            >
            <td class="committed">
              <span class="bar" aria-hidden="true">
                {#each r.commitments as c (c.unitId)}
                  <span style:width="{(c.fte / scale) * 100}%" style:background={colourOf(c.unitId)}
                  ></span>
                {/each}
              </span>
              <!-- Each commitment links into the products (#397). -->
              <span class="bar-label">
                {#if r.commitments.length === 0}{$t('line.none')}{:else}
                  {#each r.commitments as c (c.unitId)}
                    <UnitChip selection={c.unitId} name={c.name} detail={fte(c.fte)} />
                  {/each}
                {/if}
              </span>
            </td>
            <td class="num free" class:bad={r.free < 0}
              ><span class="m-label">{$t('line.col.free')}</span>{r.free < 0
                ? $t('line.overbooked.short', { fte: fte(-r.free) })
                : fte(r.free)}</td
            >
            <td class="hints" class:quiet={!r.overLimit && !r.context}>
              {#if r.overLimit}<span class="tag bad">{$t('line.hint.overLimit')}</span>{/if}
              {#if r.context}<span class="tag warn"
                  >{$t('line.hint.context', { n: r.context.teams })}</span
                >{/if}
              {#if !r.overLimit && !r.context}<span class="none" aria-label={$t('line.hint.none')}
                  >—</span
                >{/if}
            </td>
            <td class="more">
              <button
                type="button"
                class="disclose"
                aria-expanded={open === id}
                aria-controls="{uid}-{id}-detail"
                aria-label={$t('line.person.details', { name: r.person.name })}
                onclick={() => (open = open === id ? null : id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </td>
          </tr>
          {#if open === id}
            <tr class="detail" id="{uid}-{id}-detail">
              <td colspan={columns}>
                <LinePersonDetail row={r} idPrefix="{uid}-{id}" />
              </td>
            </tr>
          {/if}
        {:else}
          <tr>
            <td colspan={columns} class="empty"
              >{rows.length === 0 ? $t('line.table.empty') : $t('line.table.noMatch')}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if shown.length < sorted.length}
    <button type="button" class="show-all" onclick={() => (showAll = true)}
      >{$t('line.showAll', { n: sorted.length })}</button
    >
  {/if}
</div>

<SkillsDialog bind:this={skills} returnFocus={() => skillsButton?.focus()} />
<LinePersonAdd bind:this={adder} {unit} returnFocus={() => addButton?.focus()} />

<style>
  .staff {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
  }
  .field.search {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .field.search input {
    width: 100%;
    box-sizing: border-box;
  }
  .field.inline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .field.inline label {
    margin: 0;
    color: var(--text-muted);
  }
  .count {
    margin: 0;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-left: auto;
  }
  /* The table scrolls in its own box, so the header stays in view (sticky). */
  .scroll {
    max-height: min(70vh, 48rem);
    overflow: auto;
    border-top: 1px solid var(--border);
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.925rem;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.55rem 0.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    text-align: start;
    font-size: 0.8rem;
    font-weight: 650;
    color: var(--text-muted);
    white-space: nowrap;
  }
  tbody th,
  tbody td {
    padding: 0.55rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    text-align: start;
    font-weight: 400;
  }
  tr.opened > th,
  tr.opened > td {
    background: var(--surface-2);
    border-bottom-color: transparent;
  }
  .num {
    text-align: end;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  td.free {
    font-weight: 700;
  }
  .bad {
    color: var(--danger);
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 10rem;
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.7rem;
    font-weight: 750;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .company,
  .unit {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-width: 8rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
  :global(#app) .staff button.chip.add {
    min-height: 1.5rem;
    min-width: 1.75rem;
    padding: 0 0.5rem;
    border: 1px dashed var(--line);
    background: transparent;
    color: var(--line);
    box-shadow: none;
  }
  .committed {
    min-width: 11rem;
  }
  .bar {
    display: flex;
    height: 0.5rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .bar span {
    height: 100%;
  }
  .bar-label {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .hints {
    min-width: 7rem;
  }
  .tag {
    display: inline-block;
    margin: 0.1rem 0.25rem 0.1rem 0;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .tag.bad {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .tag.warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .none {
    color: var(--text-muted);
  }
  :global(#app) .staff button.disclose {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border-radius: 999px;
    box-shadow: none;
  }
  .disclose svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s;
  }
  .disclose[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
  tr.detail > td {
    padding: 0.25rem 0.75rem 1rem;
    background: var(--surface-2);
  }
  .empty {
    padding: 1.25rem 0.5rem;
    color: var(--text-muted);
    text-align: center;
  }
  .show-all {
    align-self: flex-start;
  }
  .m-label {
    display: none;
  }
  /* Phones: each person is a card; the column names stand next to the numbers. */
  @media (max-width: 40rem) {
    .actions {
      margin-left: 0;
    }
    .field.inline {
      flex: 1 1 100%;
      min-width: 0;
    }
    .field.inline select {
      flex: 1;
      min-width: 0;
    }
    .scroll {
      max-height: none;
      overflow: visible;
    }
    table,
    tbody {
      display: block;
    }
    thead {
      display: none;
    }
    tbody tr:not(.detail) {
      display: grid;
      grid-template-columns: 1fr auto auto;
      grid-template-areas:
        'person person more'
        'unit unit unit'
        'skills skills skills'
        'committed committed committed'
        'contract free free'
        'hints hints hints';
      gap: 0.35rem 0.75rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }
    tbody tr:not(.detail) > th,
    tbody tr:not(.detail) > td {
      padding: 0;
      border: 0;
      background: transparent;
    }
    tr > th {
      grid-area: person;
    }
    td.unit {
      grid-area: unit;
    }
    td.skills {
      grid-area: skills;
    }
    td.committed {
      grid-area: committed;
      min-width: 0;
    }
    td.contract {
      grid-area: contract;
      text-align: start;
    }
    td.free {
      grid-area: free;
      text-align: start;
    }
    td.hints {
      grid-area: hints;
    }
    td.hints.quiet {
      display: none;
    }
    td.more {
      grid-area: more;
    }
    .m-label {
      display: inline;
      margin-right: 0.35rem;
      font-weight: 400;
      color: var(--text-muted);
    }
    tr.opened {
      background: var(--surface-2);
    }
    tr.detail,
    tr.detail > td {
      display: block;
    }
    td.empty {
      display: block;
    }
  }
</style>
