<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { addDays, diffDays, isoWeek, mondayOf, weekday, type ISODate } from '../../core/date';
  import {
    cadenceNumber,
    conflicts,
    dayLoad,
    filteredOccurrences,
    scopeTeams,
    type FilteredOccurrence,
  } from '../../core/views';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import DayDetails, { type DayOverlap } from '../components/DayDetails.svelte';
  import DayItemList, { type DayItem } from '../components/DayItemList.svelte';
  import { filter, index, localToday, workspace } from '../state/workspace';

  interface Props {
    /** Switches to the Meetings view (empty-state hint). */
    onOpenMeetings: () => void;
  }
  let { onOpenMeetings }: Props = $props();

  const horizon = $derived($workspace.settings.horizon);
  const inHorizon = (d: ISODate): boolean => d >= horizon.from && d <= horizon.to;

  /** Today inside the horizon; outside of it the horizon start. */
  function clampToHorizon(): ISODate {
    const { from, to } = get(workspace).settings.horizon;
    const today = localToday();
    return today >= from && today <= to ? today : from;
  }

  let mode = $state<'month' | 'week'>('month');
  let cursor = $state<ISODate>(clampToHorizon());
  let selected = $state<ISODate | null>(null);
  let grid: HTMLTableElement | undefined = $state();
  let details: DayDetails | undefined = $state();

  const uid = $props.id();

  // ---------- dates ----------

  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;

  function addMonths(d: ISODate, n: number): ISODate {
    const total = Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1 + n;
    const first = `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
    const length = diffDays(
      `${Math.floor((total + 1) / 12)}-${pad(((total + 1) % 12) + 1)}-01`,
      first,
    );
    return addDays(first, Math.min(Number(d.slice(8, 10)), length) - 1);
  }

  function formatMonth(d: ISODate): string {
    const [y, m] = d.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat($locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  }

  function weekdayShort(n: number): string {
    // 2024-01-01 is a Monday.
    return new Intl.DateTimeFormat($locale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, n)),
    );
  }

  const weeks = $derived.by(() => {
    const first = mondayOf(monthStart(cursor));
    const lastDay = addDays(addMonths(monthStart(cursor), 1), -1);
    const count = diffDays(mondayOf(lastDay), first) / 7 + 1;
    return Array.from({ length: count }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
    );
  });
  const weekDays = $derived(Array.from({ length: 7 }, (_, d) => addDays(mondayOf(cursor), d)));

  const periodLabel = $derived(
    mode === 'month'
      ? formatMonth(cursor)
      : $t('cal.week.label', {
          n: formatNumber($locale, isoWeek(cursor), 0),
          from: formatDisplayDate($locale, weekDays[0]!, 'short'),
          to: formatDisplayDate($locale, weekDays[6]!, 'short'),
        }),
  );

  // ---------- data ----------

  /** Teams whose cadence and milestones are marked: the person's teams, or the team filter. */
  const markerTeams = $derived(scopeTeams($workspace, $filter));
  const hasEvents = $derived($workspace.teams.some((x) => x.events.length > 0));

  const loads = $derived(dayLoad($workspace, $index, $filter));
  const byDate = $derived.by(() => {
    const map: Record<ISODate, FilteredOccurrence[]> = {};
    for (const o of filteredOccurrences($workspace, $index, $filter)) (map[o.date] ??= []).push(o);
    for (const list of Object.values(map))
      list.sort((a, b) => a.start.localeCompare(b.start) || a.teamId.localeCompare(b.teamId));
    return map;
  });
  const overlapsByDate = $derived.by(() => {
    const map: Record<ISODate, ReturnType<typeof conflicts>> = {};
    if (!$filter.personId) return map;
    for (const c of conflicts($workspace, $index, $filter.personId)) (map[c.date] ??= []).push(c);
    return map;
  });

  function itemsOf(date: ISODate): DayItem[] {
    return (byDate[date] ?? []).map((o) => {
      const team = $workspace.teams.find((x) => x.id === o.teamId);
      const event = team?.events.find((e) => e.id === o.eventId);
      return {
        key: `${o.teamId}/${o.eventId}`,
        start: o.start,
        name: event?.name ?? o.eventId,
        category:
          $workspace.categories.find((c) => c.id === event?.categoryId)?.name ??
          event?.categoryId ??
          '',
        team: team?.name ?? o.teamId,
        hours: o.hours,
        skipped: o.skippedHoliday !== undefined,
      };
    });
  }

  function overlapsOf(date: ISODate): DayOverlap[] {
    const name = (o: { teamId: string; eventId: string }) => {
      const team = $workspace.teams.find((x) => x.id === o.teamId);
      return {
        event: team?.events.find((e) => e.id === o.eventId)?.name ?? o.eventId,
        team: team?.name ?? o.teamId,
      };
    };
    return (overlapsByDate[date] ?? []).map(({ a, b }) => {
      const x = name(a);
      const y = name(b);
      return {
        key: `${a.teamId}/${a.eventId}/${b.teamId}/${b.eventId}`,
        a: x.event,
        teamA: x.team,
        b: y.event,
        teamB: y.team,
      };
    });
  }

  function cell(date: ISODate) {
    const inside = inHorizon(date);
    const holiday = inside ? $index.holidays.get(date)?.[$locale] : undefined;
    const school = inside ? $index.schoolHolidays.get(date)?.[$locale] : undefined;
    const cadence: string[] = [];
    const milestones: string[] = [];
    if (inside) {
      const several = markerTeams.length > 1;
      const withTeam = (label: string, team: string) =>
        several ? $t('cal.withTeam', { label, team }) : label;
      for (const team of markerTeams) {
        const length = team.cadence.lengthWeeks * 7;
        const diff = diffDays(date, team.cadence.start);
        if (length > 0 && diff >= 0 && diff % length === 0) {
          const n = cadenceNumber(team, date) ?? 1;
          const label = $t(`cal.cadence.${team.cadence.kind}`, { n: formatNumber($locale, n, 0) });
          cadence.push(withTeam(label, team.name));
        }
        for (const cycle of team.cycles)
          for (const m of cycle.milestones)
            if (m.date === date) milestones.push(withTeam(m.name, team.name));
      }
    }
    const occs = inside ? (byDate[date] ?? []) : [];
    const count = occs.filter((o) => !o.skippedHoliday).length;
    const showLoad = inside && (occs.length > 0 || holiday !== undefined);
    const hours = $t('cal.hours', { hours: formatNumber($locale, loads.get(date) ?? 0, 1) });
    const meetings = $t(count === 1 ? 'cal.meetings.one' : 'cal.meetings.other', {
      n: formatNumber($locale, count, 0),
    });
    const overlap = inside && date in overlapsByDate;
    const nonWork = inside && !$workspace.settings.workdays.includes(weekday(date));
    const parts = [formatDisplayDate($locale, date, 'long')];
    if (!inside) parts.push($t('cal.outside'));
    if (nonWork) parts.push($t('cal.nonwork'));
    if (holiday) parts.push($t('cal.holiday', { name: holiday }));
    if (school) parts.push($t('cal.school', { name: school }));
    parts.push(...cadence, ...milestones.map((name) => $t('cal.milestone', { name })));
    if (showLoad) parts.push(hours, meetings);
    return {
      inside,
      holiday,
      school,
      cadence,
      milestones,
      showLoad,
      hours,
      meetings,
      overlap,
      nonWork,
      label: parts.join($t('cal.list.sep')),
    };
  }

  // ---------- navigation ----------

  /** Moves the cursor; details of a day in another month are closed. */
  function setCursor(date: ISODate) {
    if (selected !== null && selected.slice(0, 7) !== date.slice(0, 7)) selected = null;
    cursor = date;
  }

  async function moveTo(date: ISODate) {
    setCursor(date);
    await tick();
    focusCell(date);
  }

  function focusCell(date: ISODate) {
    grid?.querySelector<HTMLElement>(`td[data-date="${date}"]`)?.focus();
  }

  const step = (dir: 1 | -1) =>
    mode === 'month' ? addMonths(cursor, dir) : addDays(cursor, 7 * dir);

  function select(date: ISODate) {
    selected = date;
    cursor = date;
  }

  async function selectByKey(date: ISODate) {
    select(date);
    await tick();
    details?.focus();
  }

  async function closeDetails() {
    selected = null;
    await tick();
    focusCell(cursor);
  }

  function setMode(next: 'month' | 'week') {
    mode = next;
    selected = null;
  }

  function onGridKeydown(event: KeyboardEvent, date: ISODate) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let target: ISODate | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        target = addDays(date, -1);
        break;
      case 'ArrowRight':
        target = addDays(date, 1);
        break;
      case 'ArrowUp':
        target = addDays(date, -7);
        break;
      case 'ArrowDown':
        target = addDays(date, 7);
        break;
      case 'Home':
        target = mondayOf(date);
        break;
      case 'End':
        target = addDays(mondayOf(date), 6);
        break;
      case 'PageUp':
        target = addMonths(date, -1);
        break;
      case 'PageDown':
        target = addMonths(date, 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        void selectByKey(date);
        return;
      default:
        return;
    }
    event.preventDefault();
    void moveTo(target);
  }
</script>

<div class="calendar">
  {#if !hasEvents}
    <p class="hint">
      {$t('cal.noevents.text')}
      <button type="button" onclick={onOpenMeetings}>{$t('cal.noevents.button')}</button>
    </p>
  {/if}

  <div class="toolbar">
    <div class="group" role="group" aria-label={$t('cal.nav')}>
      <button type="button" onclick={() => setCursor(step(-1))}>
        {$t(mode === 'month' ? 'cal.prev.month' : 'cal.prev.week')}
      </button>
      <button type="button" onclick={() => setCursor(clampToHorizon())}>{$t('cal.today')}</button>
      <button type="button" onclick={() => setCursor(step(1))}>
        {$t(mode === 'month' ? 'cal.next.month' : 'cal.next.week')}
      </button>
    </div>
    <div class="group" role="group" aria-label={$t('cal.mode')}>
      <button type="button" aria-pressed={mode === 'month'} onclick={() => setMode('month')}>
        {$t('cal.mode.month')}
      </button>
      <button type="button" aria-pressed={mode === 'week'} onclick={() => setMode('week')}>
        {$t('cal.mode.week')}
      </button>
    </div>
    <p class="period" aria-live="polite">{periodLabel}</p>
  </div>

  {#if mode === 'month'}
    <p id="{uid}-hint" class="sr-only">{$t('cal.grid.hint')}</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
    <div class="scroll" role="region" aria-label={$t('cal.grid.region')} tabindex="0">
      <table role="grid" bind:this={grid} aria-describedby="{uid}-hint">
        <caption>{formatMonth(cursor)}</caption>
        <thead>
          <tr>
            <th scope="col" class="weekcol">{$t('cal.week')}</th>
            {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
              <th scope="col">{weekdayShort(n)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each weeks as days (days[0])}
            <tr>
              <th scope="row" class="weekcol">{formatNumber($locale, isoWeek(days[0]!), 0)}</th>
              {#each days as date (date)}
                {@const c = cell(date)}
                <td
                  role="gridcell"
                  data-date={date}
                  class:other={date.slice(0, 7) !== cursor.slice(0, 7)}
                  class:muted={!c.inside || c.nonWork}
                  class:selected={selected === date}
                  tabindex={date === cursor ? 0 : -1}
                  aria-selected={selected === date}
                  onclick={() => select(date)}
                  onkeydown={(e) => onGridKeydown(e, date)}
                >
                  <!-- The visible text is repeated in full for assistive technology. -->
                  <span class="sr-only">{c.label}</span>
                  <span class="top">
                    <span class="day" aria-hidden="true">{Number(date.slice(8, 10))}</span>
                    {#if c.overlap}
                      <span class="warn" role="img" aria-label={$t('cal.overlap.mark')}>!</span>
                    {/if}
                  </span>
                  <span class="visual" aria-hidden="true">
                    {#if c.holiday}<span class="holiday">{c.holiday}</span>{/if}
                    {#if c.school}<span class="school">{c.school}</span>{/if}
                    {#each c.cadence as label (label)}<span class="cadence">{label}</span>{/each}
                    {#each c.milestones as name (name)}<span class="milestone">{name}</span>{/each}
                    {#if c.showLoad}
                      <span class="load">{c.hours}</span>
                      <span class="count">{c.meetings}</span>
                    {/if}
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if selected !== null}
      <DayDetails
        bind:this={details}
        date={selected}
        items={itemsOf(selected)}
        overlaps={overlapsOf(selected)}
        holiday={inHorizon(selected) ? $index.holidays.get(selected)?.[$locale] : undefined}
        onclose={closeDetails}
      />
    {/if}
  {:else}
    {#each weekDays as date (date)}
      {@const items = inHorizon(date) ? itemsOf(date) : []}
      <section class="weekday">
        <h3>{formatDisplayDate($locale, date, 'long')}</h3>
        {#if inHorizon(date)}
          {#if $index.holidays.get(date)}
            <p class="note">{$t('cal.holiday', { name: $index.holidays.get(date)![$locale] })}</p>
          {/if}
          {#if !$workspace.settings.workdays.includes(weekday(date))}
            <p class="note">{$t('cal.nonwork')}</p>
          {/if}
        {/if}
        {#if !inHorizon(date)}
          <p class="muted-text">{$t('cal.outside')}</p>
        {:else if items.length === 0}
          <p class="muted-text">{$t('cal.day.none')}</p>
        {:else}
          <DayItemList {items} />
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .calendar {
    max-width: 72rem;
    min-width: 0;
  }
  .hint {
    padding: 0.75rem var(--space);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  button[aria-pressed='true'] {
    background: var(--surface);
    border-color: var(--accent);
    border-width: 2px;
    padding: calc(0.4rem - 1px) calc(0.75rem - 1px);
    font-weight: 600;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-bottom: var(--space);
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .period {
    margin: 0;
    font-weight: 600;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 44rem;
    table-layout: fixed;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 0.25rem 0.4rem;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  th {
    background: var(--surface);
  }
  .weekcol {
    width: 3.5rem;
    color: var(--text-muted);
  }
  td {
    height: 6rem;
    font-size: 0.85rem;
    cursor: pointer;
    position: relative;
  }
  td .visual span {
    display: block;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  td.muted,
  td.other {
    background: var(--surface);
    color: var(--text-muted);
  }
  td.selected {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
  td:focus-visible {
    outline-offset: -3px;
  }
  .day {
    font-weight: 700;
  }
  .warn {
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    color: var(--danger);
  }
  .holiday {
    font-weight: 600;
  }
  .school,
  .count {
    color: var(--text-muted);
  }
  .cadence {
    font-style: italic;
  }
  .weekday {
    margin-bottom: var(--space);
  }
  .weekday h3 {
    margin: 0 0 0.25rem;
  }
  .muted-text {
    margin: 0;
    color: var(--text-muted);
  }
  .note {
    margin: 0;
    font-weight: 600;
  }
</style>
