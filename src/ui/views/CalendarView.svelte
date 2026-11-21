<script lang="ts" module>
  /** The level outlives the view, which is rebuilt when the planning horizon changes. */
  let lastMode: Mode = 'month';
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    addDays,
    diffDays,
    fromMinutes,
    isoWeek,
    mondayOf,
    toMinutes,
    weekday,
    type ISODate,
  } from '../../core/date';
  import {
    cadenceNumber,
    conflicts,
    dayLoad,
    filteredOccurrences,
    scopeUnits,
    type FilteredOccurrence,
  } from '../../core/views';
  import { formatDisplayDate, formatNumber, levels, locale, translate as t } from '../../i18n';
  import DayDetails, { type DayOverlap } from '../components/DayDetails.svelte';
  import AreaIcon from '../components/AreaIcon.svelte';
  import DayItemList, { type DayItem } from '../components/DayItemList.svelte';
  import WeeksView from './WeeksView.svelte';
  import {
    participantName,
    units,
    areaUnits,
    unitName,
    type CalEvent,
    type Category,
    type Team,
  } from '../../core/model';
  import { record } from '../../core/record';
  import { ruleSummary } from '../meetings/rules';
  import { calendarDay, calendarWeek } from '../state/focus';
  import { filter, index, localToday, workspace } from '../state/workspace';

  interface Props {
    /** Switches to the Meetings view (empty-state hint). */
    onOpenMeetings: () => void;
    /** Opens a meeting in the Meetings view (Edit in the day details). */
    onEditMeeting?: (teamId: string, eventId: string) => void;
    /** Whether the calendar is the open view; the hidden Horizon table is not kept up to date. */
    shown?: boolean;
  }
  let { onOpenMeetings, onEditMeeting, shown = true }: Props = $props();

  const horizon = $derived($workspace.settings.horizon);
  const inHorizon = (d: ISODate): boolean => d >= horizon.from && d <= horizon.to;

  /** Today inside the horizon; outside of it the horizon start. */
  function clampToHorizon(): ISODate {
    const { from, to } = get(workspace).settings.horizon;
    const today = localToday();
    return today >= from && today <= to ? today : from;
  }

  type Mode = 'week' | 'month' | 'range';
  /** Week and month page through the horizon; range shows all of its weeks as one table. */
  let mode = $state<Mode>(lastMode);
  const modes: readonly Mode[] = ['week', 'month', 'range'];
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

  /** Units whose cadence and milestones are marked: the person's, or the team or area filter. */
  const markerTeams = $derived(scopeUnits($workspace, $filter));
  const hasEvents = $derived(units($workspace).some((x) => x.events.length > 0));

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

  const severalTeams = $derived($workspace.teams.length > 1);

  /** Team or area, meeting and category of every meeting, by `teamId/eventId`. */
  const lookup = $derived.by(() => {
    const categories = record<Category>();
    for (const c of $workspace.categories) categories[c.id] = c;
    // The organisation's meetings stand out like an area's (#328).
    const areaIds = new Set(areaUnits($workspace).map((a) => a.id));
    const map = record<{ team: Team; event: CalEvent; category?: Category; area: boolean }>();
    for (const team of units($workspace))
      for (const event of team.events)
        map[`${team.id}/${event.id}`] = {
          team,
          event,
          category: categories[event.categoryId],
          area: areaIds.has(team.id),
        };
    return map;
  });
  const infoOf = (o: { teamId: string; eventId: string }) => lookup[`${o.teamId}/${o.eventId}`];

  function itemsOf(date: ISODate): DayItem[] {
    return (byDate[date] ?? []).map((o) => {
      const { team, event, category, area } = infoOf(o) ?? {};
      const end = toMinutes(o.start) + o.duration;
      const about = [
        category?.name ?? event?.categoryId,
        event && team ? ruleSummary(event.rule, team, $t, $locale) : undefined,
        // An area meeting always names its area, so it stands out from the teams' meetings.
        area || severalTeams ? unitName($workspace, o.teamId, $levels.org) || o.teamId : undefined,
      ].filter(Boolean);
      const roles = (event?.participants ?? []).map((p) => participantName($workspace, p));
      return {
        key: `${o.teamId}/${o.eventId}`,
        teamId: o.teamId,
        eventId: o.eventId,
        start: o.start,
        end: fromMinutes(end % (24 * 60)),
        nextDay: end >= 24 * 60,
        name: event?.name ?? o.eventId,
        about: about.join(' · '),
        roles: roles.join($t('cal.list.sep')),
        colour: category?.colour,
        area: area === true,
        hours: o.hours,
        preparation: event?.preparation ?? 0,
        skipped: o.skippedHoliday !== undefined,
      };
    });
  }

  /** Explains the hours at the top of a day, with an example value, for the chosen person or role. */
  const hoursKey = $derived(
    $t('cal.legend.hours', {
      hours: $t('cal.hours', { hours: formatNumber($locale, 1.5, 1) }),
      who: legendWho(),
    }),
  );

  /** Whose hours the days show: the chosen person, all people in the chosen role, or all people. */
  function legendWho(): string {
    const person = $filter.personId && $workspace.people.find((p) => p.id === $filter.personId);
    if (person) return person.name;
    const role = $filter.roleId && $workspace.roles.find((r) => r.id === $filter.roleId);
    if (role) return $t('cal.legend.role', { role: role.name });
    return $t('cal.legend.all');
  }

  /** Categories of the meetings shown in the month, in the order of the category list. */
  const legend = $derived.by(() => {
    const used: Record<string, true> = {};
    for (const days of weeks)
      for (const date of days)
        if (inHorizon(date))
          for (const o of byDate[date] ?? []) {
            const id = infoOf(o)?.event.categoryId;
            if (!o.skippedHoliday && id) used[id] = true;
          }
    return $workspace.categories.filter((c) => used[c.id]);
  });

  function overlapsOf(date: ISODate): DayOverlap[] {
    const name = (o: { teamId: string; eventId: string }) => {
      const info = infoOf(o);
      return { event: info?.event.name ?? o.eventId, team: info?.team.name ?? o.teamId };
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
    const chips = occs
      .filter((o) => !o.skippedHoliday)
      .map((o) => {
        const info = infoOf(o);
        const colour = info?.category?.colour ?? '#64748b';
        return {
          key: `${o.teamId}/${o.eventId}`,
          start: o.start,
          name: info?.event.name ?? '',
          colour,
          area: info?.area === true,
        };
      });
    const today = date === localToday();
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
      chips,
      today,
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

  async function select(date: ISODate) {
    selected = date;
    cursor = date;
    // Below the grid (narrow screens) the details may start off screen.
    if (floating) return;
    await tick();
    board?.querySelector('.pop')?.scrollIntoView({ block: 'nearest' });
  }

  async function selectByKey(date: ISODate) {
    await select(date);
    await tick();
    details?.focus();
  }

  async function closeDetails() {
    selected = null;
    await tick();
    focusCell(cursor);
  }

  async function setMode(next: Mode) {
    // The switch moves between toolbars to and from the range level; keep focus on it.
    const focused = root?.querySelector('.levels')?.contains(document.activeElement) ?? false;
    mode = lastMode = next;
    selected = null;
    if (!focused) return;
    await tick();
    // Into the range level without scrolling: it scrolls its current week into view itself.
    root
      ?.querySelector<HTMLElement>('.levels [aria-pressed="true"]')
      ?.focus({ preventScroll: next === 'range' });
  }

  // A week another view links to (#343, #339): shown on the week level.
  $effect(() => {
    const date = $calendarWeek;
    if (date === null || !shown) return;
    calendarWeek.set(null);
    const { from } = horizon;
    // A week that starts before the horizon is shown from the horizon's first day.
    const day = date < from && addDays(mondayOf(date), 6) >= from ? from : date;
    if (!inHorizon(day)) return;
    mode = lastMode = 'week';
    selected = null;
    cursor = day;
  });

  // A day another view links to (#341): opened with its details, as if chosen in the grid.
  $effect(() => {
    const date = $calendarDay;
    if (date === null || !shown) return;
    calendarDay.set(null);
    if (!inHorizon(date)) return;
    if (mode === 'range') mode = lastMode = 'month';
    void tick().then(() => selectByKey(date));
  });

  function edit(item: DayItem) {
    onEditMeeting?.(item.teamId, item.eventId);
  }

  // ---------- day details next to the selected day ----------

  let root: HTMLDivElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let boardWidth = $state(0);
  let popWidth = $state(0);
  let popHeight = $state(0);
  let place = $state<{ left: number; top: number; height: number } | null>(null);
  /** Counts size changes of the grid: a filter or an edit can move the selected day. */
  let layout = $state(0);
  $effect(() => {
    if (!grid) return;
    const observer = new ResizeObserver(() => layout++);
    observer.observe(grid);
    // The legend or a hint above the grid can change the room left for it.
    if (root) observer.observe(root);
    return () => observer.disconnect();
  });
  /**
   * Beside the grid only when the whole month fits; otherwise the details follow below it and the
   * grid is compact. 44rem matches the container query in the styles, at any root font size.
   */
  const floating = $derived(
    boardWidth >= 44 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16),
  );

  $effect(() => {
    void [selected, cursor, boardWidth, popWidth, popHeight, layout];
    if (!floating || selected === null || !board || !grid) {
      place = null;
      return;
    }
    const cell = grid.querySelector<HTMLElement>(`td[data-date="${selected}"]`);
    if (!cell) {
      place = null;
      return;
    }
    const b = board.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const gap = 8;
    // Right of the day, else left of it, else over its column.
    let left = c.right - b.left + gap;
    if (left + popWidth > b.width) left = c.left - b.left - popWidth - gap;
    if (left < 0) left = Math.max(0, Math.min(c.left - b.left, b.width - popWidth));
    // Never taller than the grid: a long day scrolls inside the details.
    const top = Math.max(0, Math.min(c.top - b.top, b.height - popHeight));
    place = { left, top, height: b.height };
  });

  // ---------- fit the month into the window ----------

  let innerHeight = $state(0);
  /** The root font size in px, read when the fit is computed. */
  let r = $state(16);
  /** Row height in px that lets the whole month fit the window; null keeps the roomy default. */
  let rowPx = $state<number | null>(null);
  $effect(() => {
    void [innerHeight, layout, weeks.length];
    const body = grid?.tBodies[0];
    if (!floating || !grid || !body || !root) {
      rowPx = null;
      return;
    }
    r = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // Space between the first week and the window bottom, minus the legend and card padding below.
    const below = root.getBoundingClientRect().bottom - grid.getBoundingClientRect().bottom;
    const top = body.getBoundingClientRect().top + window.scrollY;
    const fit = Math.floor((innerHeight - top - below - r) / weeks.length);
    // Never taller than the default (large screens stay as they are), never too short for a day
    // number and one entry, nor for a day's tags, which always show (see fitChips): then the page
    // scrolls as before.
    const max = 8.4 * r + 1;
    const tags = Math.max(0, ...weeks.flat().map((d) => tagCount(cell(d))));
    rowPx = fit >= max ? null : Math.max(fit, 4.75 * r, (2.75 + 1.45 * tags) * r + 1);
  });
  /** Width in px of a day cell's content box and the chip font, for the name wrap below. */
  let dayWidth = $state(0);
  let chipFont = '';
  $effect(() => {
    void [boardWidth, weeks.length, layout, innerHeight];
    const td = grid?.tBodies[0]?.rows[0]?.cells[1];
    if (!grid || !td) {
      dayWidth = 0;
      return;
    }
    r = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    chipFont = `550 ${0.8 * r}px ${getComputedStyle(grid).fontFamily}`;
    // Minus the padding and the right border; the width is not rounded like clientWidth.
    dayWidth = td.getBoundingClientRect().width - r - 1;
  });
  let ctx: CanvasRenderingContext2D | null = null;
  /** Whether a meeting name needs a second line in its chip (it wraps to two, then ends in "…"). */
  function wraps(chip: ReturnType<typeof cell>['chips'][number]): boolean {
    if (dayWidth === 0) return false;
    ctx ??= document.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    // Padding, the colour bar and 1px to spare. The start time is left out: its container query
    // never matches, because table cells cannot be size containers.
    let text = dayWidth - 0.9 * r - 3 - 1;
    if (chip.area) text -= 0.8 * r + 0.25 * r;
    ctx.font = chipFont;
    return ctx.measureText(chip.name).width > text;
  }
  /**
   * How many meetings a day shows, and whether "+n more" counts the rest. The tags come first, then as many meetings as fit (heights in rem: tag 1.45, meeting 1.6 or 2.65 on two
   * lines, "+n more" 1.2, each with its gap; 2.75 for the padding, day number and spacing above
   * them). When not even "+n more" fits, the hours next to the day number still show that there
   * are meetings.
   */
  /** Holidays, cadence and milestones: a day shows them all, before any meeting. */
  const tagCount = (c: ReturnType<typeof cell>) =>
    (c.holiday ? 1 : 0) + (c.school ? 1 : 0) + c.cadence.length + c.milestones.length;
  function fitChips(c: ReturnType<typeof cell>): { shown: number; more: boolean } {
    const all = c.chips.length;
    // The compact grid shows a dot for every meeting.
    if (!floating) return { shown: all, more: false };
    const tags = tagCount(c);
    // A roomy row has the default height (see td in the styles).
    const room = (rowPx ?? 8.4 * r + 1) - 1 - (2.75 + 1.45 * tags) * r;
    const heights = c.chips.slice(0, 3).map((chip) => (wraps(chip) ? 2.65 : 1.6) * r);
    const used = (n: number) => heights.slice(0, n).reduce((a, b) => a + b, 0);
    let n = heights.length;
    while (n > 0 && used(n) + (all > n ? 1.2 * r : 0) > room) n--;
    return { shown: n, more: all > n && used(n) + 1.2 * r <= room };
  }

  /** A click outside the details and the grid closes them, as with any popover. */
  function onWindowClick(event: MouseEvent) {
    if (selected === null || !board || !(event.target instanceof Node)) return;
    // Hidden behind another view, or the click was on the calendar itself.
    if (board.offsetParent === null || board.contains(event.target)) return;
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
      case 'Escape':
        if (selected === null) return;
        event.preventDefault();
        selected = null;
        return;
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

<svelte:window onclick={onWindowClick} bind:innerHeight />

<div class="calendar" bind:this={root}>
  {#if !hasEvents}
    <p class="hint">
      {$t('cal.noevents.text')}
      <button type="button" onclick={onOpenMeetings}>{$t('cal.noevents.button')}</button>
    </p>
  {/if}

  {#snippet levels()}
    <div class="segmented levels" data-no-print role="group" aria-label={$t('cal.mode')}>
      {#each modes as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => setMode(m)}>
          {$t('cal.mode.' + m)}
        </button>
      {/each}
    </div>
  {/snippet}

  {#if mode !== 'range'}
    <div class="toolbar">
      <div class="nav" data-no-print role="group" aria-label={$t('cal.nav')}>
        <button
          type="button"
          class="step"
          aria-label={$t(mode === 'month' ? 'cal.prev.month' : 'cal.prev.week')}
          title={$t(mode === 'month' ? 'cal.prev.month' : 'cal.prev.week')}
          onclick={() => setCursor(step(-1))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button
          type="button"
          class="step"
          aria-label={$t(mode === 'month' ? 'cal.next.month' : 'cal.next.week')}
          title={$t(mode === 'month' ? 'cal.next.month' : 'cal.next.week')}
          onclick={() => setCursor(step(1))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <button type="button" class="today" onclick={() => setCursor(clampToHorizon())}
          >{$t('cal.today')}</button
        >
      </div>
      <p class="period" aria-live="polite">{periodLabel}</p>
      {@render levels()}
    </div>
  {/if}

  {#if mode === 'month'}
    <p id="{uid}-hint" class="sr-only">{$t('cal.grid.hint')}</p>
    <div class="board" bind:this={board} bind:clientWidth={boardWidth}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
      <div class="scroll" role="region" aria-label={$t('cal.grid.region')} tabindex="0">
        <table
          role="grid"
          bind:this={grid}
          aria-describedby="{uid}-hint"
          style:--row={rowPx === null ? undefined : `${rowPx}px`}
        >
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
                  {@const fit = fitChips(c)}
                  <td
                    role="gridcell"
                    data-date={date}
                    class:other={date.slice(0, 7) !== cursor.slice(0, 7)}
                    class:outside={!c.inside}
                    class:nonwork={c.nonWork}
                    class:selected={selected === date}
                    class:today={c.today}
                    tabindex={date === cursor ? 0 : -1}
                    aria-selected={selected === date}
                    aria-current={c.today ? 'date' : undefined}
                    onclick={() => void select(date)}
                    onkeydown={(e) => onGridKeydown(e, date)}
                  >
                    <!-- The visible text is repeated in full for assistive technology. -->
                    <span class="sr-only">{c.label}</span>
                    <span class="top">
                      <span class="day" aria-hidden="true">{Number(date.slice(8, 10))}</span>
                      {#if c.overlap}
                        <span class="warn" role="img" aria-label={$t('cal.overlap.mark')}>!</span>
                      {/if}
                      {#if c.showLoad && c.chips.length > 0}<span class="load" aria-hidden="true"
                          >{c.hours}</span
                        >{/if}
                    </span>
                    <span class="visual" aria-hidden="true">
                      {#if c.holiday}<span class="tag holiday">{c.holiday}</span>{/if}
                      {#if c.school}<span class="tag school">{c.school}</span>{/if}
                      {#each c.cadence as label, i (i)}<span class="tag cadence">{label}</span
                        >{/each}
                      {#each c.milestones as name, i (i)}<span class="tag milestone"
                          ><span class="diamond"></span>{name}</span
                        >{/each}
                      {#each c.chips.slice(0, fit.shown) as chip (chip.key)}
                        <span class="chip" style:--c={chip.colour}
                          ><span class="t">{chip.start}</span>{#if chip.area}<span class="area"
                              ><AreaIcon /></span
                            >{/if}{chip.name}</span
                        >
                      {/each}
                      {#if fit.more}<span class="more"
                          >{$t('cal.more', {
                            n: formatNumber($locale, c.chips.length - fit.shown, 0),
                          })}</span
                        >{/if}
                    </span>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if selected !== null}
        <div
          class="pop"
          class:floating
          style:left={place ? `${place.left}px` : undefined}
          style:top={place ? `${place.top}px` : undefined}
          style:max-height={place ? `${place.height}px` : undefined}
          style:visibility={floating && !place ? 'hidden' : undefined}
          bind:clientWidth={popWidth}
          bind:clientHeight={popHeight}
        >
          <DayDetails
            bind:this={details}
            date={selected}
            items={itemsOf(selected)}
            overlaps={overlapsOf(selected)}
            holiday={inHorizon(selected) ? $index.holidays.get(selected)?.[$locale] : undefined}
            onclose={closeDetails}
            onedit={onEditMeeting ? edit : undefined}
          />
        </div>
      {/if}
    </div>
    <div class="legend">
      {#if legend.length > 0}
        <ul aria-label={$t('cal.legend')}>
          {#each legend as category (category.id)}
            <li><i style:--c={category.colour} aria-hidden="true"></i>{category.name}</li>
          {/each}
        </ul>
      {/if}
      <p>
        {hoursKey}
      </p>
    </div>
  {:else if mode === 'week'}
    <div class="week">
      {#each weekDays as date (date)}
        {@const items = inHorizon(date) ? itemsOf(date) : []}
        {@const overlaps = inHorizon(date) ? overlapsOf(date) : []}
        <section class="weekday" class:today={date === localToday()}>
          <div class="when">
            <h3>{formatDisplayDate($locale, date, 'long')}</h3>
            {#if items.some((i) => !i.skipped)}
              <span class="sum"
                >{$t('cal.hours', { hours: formatNumber($locale, loads.get(date) ?? 0, 1) })}</span
              >
            {/if}
            {#if overlaps.length > 0}
              <span class="warn" aria-hidden="true">!</span>
            {/if}
          </div>
          <div class="items">
            {#if inHorizon(date)}
              {#if $index.holidays.get(date)}
                <p class="note">
                  {$t('cal.holiday', { name: $index.holidays.get(date)![$locale] })}
                </p>
              {/if}
              {#if !$workspace.settings.workdays.includes(weekday(date))}
                <p class="note">{$t('cal.nonwork')}</p>
              {/if}
            {/if}
            {#each overlaps as o (o.key)}
              <p class="note">
                <span aria-hidden="true">⚠</span>
                {$t('cal.overlap', { a: o.a, teamA: o.teamA, b: o.b, teamB: o.teamB })}
              </p>
            {/each}
            {#if !inHorizon(date)}
              <p class="muted-text">{$t('cal.outside')}</p>
            {:else if items.length === 0}
              <p class="muted-text">{$t('cal.day.none')}</p>
            {:else}
              <DayItemList {items} onedit={onEditMeeting ? edit : undefined} />
            {/if}
          </div>
        </section>
      {/each}
    </div>
  {:else if shown}
    <WeeksView {levels} />
  {/if}
</div>

<style>
  .calendar {
    min-width: 0;
  }
  .hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin: 0 0 1.25rem;
    padding: 0.9rem 1.1rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin-bottom: 1.25rem;
  }
  .nav {
    display: flex;
    gap: 0.4rem;
  }
  :global(#app) .nav .step {
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    padding: 0;
  }
  .step svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .period {
    flex: 1;
    margin: 0 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 750;
    letter-spacing: -0.02em;
  }
  .board {
    position: relative;
  }
  .scroll {
    position: relative;
    overflow-x: auto;
    border-radius: var(--radius-lg);
    container: month / inline-size;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    min-width: 44rem;
    table-layout: fixed;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  th,
  td {
    border: 0;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 0.45rem 0.5rem;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  tr > :last-child {
    border-right: 0;
  }
  tbody tr:last-child > * {
    border-bottom: 0;
  }
  thead th {
    padding: 0.6rem;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .weekcol {
    width: 3rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
    background: var(--surface-2);
  }
  td {
    /* --row is the whole row; the cell height excludes its padding and bottom border. */
    height: calc(var(--row, 8.4rem + 1px) - 0.9rem - 1px);
    font-size: 0.8rem;
    cursor: pointer;
    position: relative;
    container-type: inline-size;
    background: var(--surface);
    transition: background-color 0.12s;
  }
  td.nonwork {
    background: color-mix(in srgb, var(--surface-2) 60%, var(--surface));
  }
  td.other .day {
    color: var(--text-muted);
    font-weight: 600;
  }
  td.outside {
    background:
      repeating-linear-gradient(
        -45deg,
        transparent 0 6px,
        color-mix(in srgb, var(--border) 45%, transparent) 6px 7px
      ),
      var(--surface-2);
  }
  td:hover {
    background: var(--accent-soft);
  }
  td.selected {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  td:focus-visible {
    outline-offset: -3px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .day {
    display: inline-grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
  }
  td.today .day {
    color: #fff;
    background: linear-gradient(135deg, #7b6bff, #5340e6);
    box-shadow: 0 4px 10px -2px rgb(83 64 230 / 0.55);
  }
  .warn {
    padding: 0 0.4rem;
    border-radius: 999px;
    font-weight: 700;
    color: var(--danger);
    background: var(--danger-soft);
  }
  .load {
    margin-left: auto;
    font-size: 0.72rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .visual {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    margin-top: 0.3rem;
  }
  .visual > span {
    max-width: 100%;
    line-height: 1.3;
  }
  .tag {
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid transparent;
  }
  .holiday {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .school {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .cadence {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .milestone {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--ok-soft);
    color: var(--ok);
  }
  .diamond {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    rotate: 45deg;
    background: currentColor;
  }
  /* Names wrap to two lines, then end in an ellipsis; the day details have the rest. */
  .chip {
    align-self: stretch;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    padding: 0.15rem 0.45rem;
    border-radius: 0.35rem;
    border-left: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 16%, var(--surface));
    color: var(--text);
    font-weight: 550;
  }
  .chip .area {
    color: var(--area);
    margin-right: 0.25rem;
  }
  .chip .t {
    display: none;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-weight: 500;
    margin-right: 0.3rem;
  }
  @container (min-width: 9rem) {
    .chip .t {
      display: inline;
    }
  }
  /* Narrow (a phone): all seven days fit; a day shows its number and a dot per meeting. */
  @container month (max-width: 44rem) {
    table {
      min-width: 0;
    }
    .weekcol {
      display: none;
    }
    thead th {
      padding: 0.5rem 0;
      text-align: center;
      letter-spacing: 0;
    }
    td {
      height: 3.6rem;
      padding: 0.3rem 0.1rem;
      text-align: center;
    }
    .top {
      flex-wrap: wrap;
      justify-content: center;
    }
    .day {
      min-width: 1.6rem;
      height: 1.6rem;
      padding: 0;
    }
    .load,
    .tag,
    .more {
      display: none;
    }
    .warn {
      padding: 0 0.3rem;
    }
    .visual {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.2rem;
    }
    .chip {
      align-self: auto;
      /* A border, not a background: forced colours keep borders visible. */
      box-sizing: content-box;
      width: 0;
      height: 0;
      padding: 0;
      border: 0.225rem solid var(--c);
      border-radius: 50%;
      font-size: 0;
    }
    .chip > span {
      display: none;
    }
  }
  .more {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted);
  }
  .pop {
    margin-top: 1rem;
  }
  .pop.floating {
    position: absolute;
    z-index: 3;
    width: 21rem;
    margin: 0;
    overflow-y: auto;
    border-radius: var(--radius-lg);
    box-shadow:
      0 18px 40px -12px rgb(15 20 38 / 0.28),
      0 2px 6px rgb(15 20 38 / 0.08);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.5rem;
    margin-top: 0.9rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .legend ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .legend i {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--c);
  }
  .legend p {
    margin: 0 0 0 auto;
  }
  .week {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .weekday {
    display: grid;
    grid-template-columns: minmax(0, 13rem) minmax(0, 1fr);
    gap: 0.5rem 1.25rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .weekday:last-child {
    border-bottom: 0;
  }
  .sum {
    font-size: 0.85rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.4rem;
    align-content: start;
  }
  .when h3 {
    flex-basis: 100%;
  }
  .when .warn {
    font-size: 0.85rem;
  }
  .items :global(ul) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  }
  .weekday.today h3 {
    color: var(--accent-text);
  }
  .weekday h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .muted-text {
    margin: 0;
    color: var(--text-muted);
  }
  .note {
    margin: 0;
    font-weight: 600;
  }
  @media (max-width: 40rem) {
    .weekday {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* Forced colours drop shadows and gradients: draw the states with borders and an underline. */
  @media (forced-colors: active) {
    td.selected::after {
      content: '';
      position: absolute;
      inset: 3px;
      border: 2px solid Highlight;
      pointer-events: none;
    }
    td.today .day {
      border: 2px solid CanvasText;
    }
    .tag {
      border-color: CanvasText;
    }
    .legend i {
      background: CanvasText;
    }
  }
</style>
