<script lang="ts">
  import { tick } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { areaShare } from '../../core/areaCosts';
  import { costSummary } from '../../core/cost';
  import { addDays, isoWeek } from '../../core/date';
  import {
    areaHints,
    areaHours,
    capacity,
    fte,
    hoursIn,
    loadPerWeek,
    overbooked,
    overMax,
    personLoad,
    personMeetings,
    roomBeforeLimit,
    warnings,
    type PersonMeeting,
  } from '../../core/load';
  import {
    areaUnits,
    keyName,
    ORG_UNIT,
    orgName,
    units as allUnits,
    unitLoadIds,
    unitName,
  } from '../../core/model';
  import { record } from '../../core/record';
  import {
    clashes,
    loadSummary,
    overlapPairs,
    overviewWindow,
    scopePeople,
    scopeUnits,
    warnedWeeks,
    weekRows,
  } from '../../core/views';
  import {
    formatDisplayDate,
    formatNumber,
    formatPercent,
    areaText,
    levels,
    locale,
    nextWeeks,
    translate as t,
  } from '../../i18n';
  import CostCard from '../components/CostCard.svelte';
  import OverlapList from '../components/OverlapList.svelte';
  import RateInvite from '../components/RateInvite.svelte';
  import WeekFocus from '../components/WeekFocus.svelte';
  import { ruleSummary } from '../meetings/rules';
  import { loadOverlaps } from '../state/focus';
  import { filter, index, localToday, workspace } from '../state/workspace';

  interface Props {
    /** Opens a week in the Calendar with the Person filter on that person (#343). */
    onOpenWeek?: (personId: string, monday: string) => void;
    /** Opens an area's Structure page at a person, to set their hours there (#361). */
    onOpenStructure?: (areaId: string, personId: string) => void;
  }
  let { onOpenWeek, onOpenStructure }: Props = $props();

  const summary = $derived(loadSummary($workspace, $filter));
  const weeks = $derived(loadPerWeek($workspace, $index));
  const hpw = $derived($workspace.settings.hoursPerWeek);

  /** A role's name, or the name of a person invited by name (#285). */
  const roleName = (id: string): string => keyName($workspace, id);
  const categoryName = (id: string): string =>
    $workspace.categories.find((c) => c.id === id)?.name ?? id;

  const hours = (n: number): string => formatNumber($locale, n, 1);
  /** Weekly hours as people say them: 52 h, 37.5 h. */
  const weekly = (n: number): string =>
    new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n);
  const weekLabel = (monday: string): string =>
    $t('weeks.week', { n: formatNumber($locale, isoWeek(monday), 0) });

  /** With a team or area filter the person table shows its members and their hours in it. */
  const teamId = $derived($filter.personId ? undefined : $filter.teamId);
  const area = $derived($workspace.areas.find((a) => a.id === teamId));
  /** "Of which here": not for the organisation, where it equals the total (#436). */
  const showHere = $derived(!!teamId && teamId !== ORG_UNIT);
  /** The team's id, or an area's teams and the area itself (its own meetings count there). */
  const teamIds = $derived(teamId ? unitLoadIds($workspace, teamId) : undefined);
  /** The role filter narrows the list to the people with that role in scope (#473). */
  const roleId = $derived($filter.personId ? undefined : $filter.roleId);
  const people = $derived.by(() => {
    if ($filter.personId) return $workspace.people.filter((p) => p.id === $filter.personId);
    if (!teamId && !roleId) return $workspace.people;
    const inScope = scopePeople($workspace, { teamId, roleId });
    return $workspace.people.filter((p) => inScope.has(p.id));
  });

  /**
   * Each person is judged on all their meetings ÷ their hours in all their teams and areas, at
   * most the Settings weekly hours, in every scope (#273, #342); with a team or area filter
   * `here` keeps their part in it.
   */
  const perPerson = $derived(
    people.map((person) => {
      const { hours: average, base: cap, share } = personLoad($workspace, weeks, person.id);
      let peak: { monday: string; hours: number } | undefined;
      for (const w of weeks) {
        const h = w.byPerson[person.id] ?? 0;
        if (h > 0 && (peak === undefined || h > peak.hours)) peak = { monday: w.monday, hours: h };
      }
      const hereHours =
        teamIds && weeks.length > 0
          ? weeks.reduce((sum, w) => sum + hoursIn(w, teamIds, person.id), 0) / weeks.length
          : 0;
      const hereCap = capacity($workspace, person.id, teamId);
      return {
        person,
        average,
        cap,
        fte: share,
        here: { hours: hereHours, cap: hereCap, share: fte(hereHours, hereCap) },
        /**
         * Hours per week that still fit into meetings before the limit; negative when over (#448).
         * Just over the limit (strict >) can round to 0.0 h, so the badge can show with Room 0.0 h.
         */
        free: roomBeforeLimit({ hours: average, base: cap }, maxFte),
        units: unitsOf(person.id),
        peak,
      };
    }),
  );

  // ---------- people list (M2) ----------

  const maxFte = $derived($workspace.settings.thresholds.maxFte);
  /** The teams and areas a person works in, with roles, weekly hours and meeting hours there. */
  function unitsOf(personId: string) {
    const ws = $workspace;
    const avg = (id: string) =>
      weeks.length > 0
        ? weeks.reduce((sum, w) => sum + (w.byTeamPerson[id]?.[personId] ?? 0), 0) / weeks.length
        : 0;
    const teams = ws.teams
      .filter((x) => x.members.some((m) => m.personId === personId))
      .map((x) => ({
        id: x.id,
        name: x.name,
        area: false,
        roles: x.members.filter((m) => m.personId === personId).map((m) => roleName(m.roleId)),
        hours: capacity(ws, personId, x.id),
        meetings: avg(x.id),
      }));
    // The organisation's people count like an area's (#328).
    const areas = areaUnits(ws)
      .filter(
        (a) =>
          a.members.some((m) => m.personId === personId) || Object.hasOwn(a.memberHours, personId),
      )
      .map((a) => ({
        id: a.id,
        name: a.id === ORG_UNIT ? orgName(ws, $levels.org) : a.name,
        area: true,
        roles: a.members.filter((m) => m.personId === personId).map((m) => roleName(m.roleId)),
        hours: areaHours(ws, a.id, personId),
        meetings: avg(a.id),
      }));
    return [...teams, ...areas];
  }
  /**
   * Teams and areas whose meetings a person attends without working there: an area meeting that
   * invites a role from the teams (#265) or a meeting that invites them by name (#285). Their lines
   * in the drill-in keep the meetings adding up to the person's Ø hours per week.
   */
  function invitedOf(personId: string, known: { id: string }[]) {
    const ws = $workspace;
    const areaIds = new Set(areaUnits(ws).map((a) => a.id));
    return allUnits(ws)
      .filter((u) => !known.some((k) => k.id === u.id))
      .map((u) => ({
        id: u.id,
        name: unitName(ws, u.id, $levels.org),
        area: areaIds.has(u.id),
        roles: [] as string[],
        hours: 0,
        meetings:
          weeks.length > 0
            ? weeks.reduce((sum, w) => sum + (w.byTeamPerson[u.id]?.[personId] ?? 0), 0) /
              weeks.length
            : 0,
      }))
      .filter((u) => u.meetings > 0);
  }
  let sortBy = $state<'share' | 'free'>('share');
  const sorted = $derived(
    [...perPerson].sort((a, b) =>
      sortBy === 'share'
        ? shareKey(b) - shareKey(a) || a.person.name.localeCompare(b.person.name)
        : b.free - a.free || a.person.name.localeCompare(b.person.name),
    ),
  );
  let openPerson = $state<string | null>(null);
  // A person who left the list (another team or filter) does not come back opened.
  $effect(() => {
    if (openPerson !== null && !perPerson.some((p) => p.person.id === openPerson))
      openPerson = null;
  });
  /** The meetings of the opened person, by team or area, with their repeat rule (#343). */
  const openMeetings = $derived.by(() => {
    const out = record<(PersonMeeting & { name: string; rule: string })[]>();
    if (openPerson === null) return out;
    const byUnit = personMeetings($workspace, $index, openPerson);
    for (const unit of allUnits($workspace)) {
      const list = byUnit[unit.id];
      if (!list) continue;
      out[unit.id] = list.map((m) => {
        const event = unit.events.find((e) => e.id === m.eventId)!;
        return { ...m, name: event.name, rule: ruleSummary(event.rule, unit, $t, $locale) };
      });
    }
    return out;
  });
  /** Meetings without weekly hours to measure them against come first: always over the limit. */
  const noHours = (p: { average: number; cap: number }) => p.average > 0 && p.cap <= 0;
  const shareKey = (p: { average: number; cap: number; fte: number }) =>
    noHours(p) ? Infinity : p.fte;
  const barWidth = (share: number) =>
    maxFte > 0 ? Math.min(100, (share / (1.5 * maxFte)) * 100) : 0;

  const allWarnings = $derived(warnings(weeks, $workspace));

  /**
   * Area hours that are missing or mostly taken by area meetings: hints, not warnings (#307).
   * With an area chosen only that area's hints; sorted by name.
   */
  const hintItems = $derived.by(() => {
    const ws = $workspace;
    const inScope = scopePeople(ws, $filter);
    const nameOf = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
    // Inside a sentence an unnamed organisation is "the organisation" (#328).
    const where = (id: string) => unitName(ws, id, $levels.orgThe) || id;
    return areaHints(weeks, ws)
      .filter((h) => inScope.has(h.personId) && (!area || h.areaId === area.id))
      .sort((a, b) => nameOf(a.personId).localeCompare(nameOf(b.personId), $locale))
      .map((h) => ({
        ...h,
        key: `${h.personId}/${h.areaId}`,
        label: $t('load.hint.setHours', { person: nameOf(h.personId), area: where(h.areaId) }),
        text: $t(`load.hint.${h.kind}`, {
          person: nameOf(h.personId),
          area: where(h.areaId),
          hours: hours(h.hours),
          share: formatPercent($locale, fte(h.hours, h.areaHours)),
          areaHours: weekly(h.areaHours),
        }),
      }));
  });
  /**
   * An organisation meeting that invites a role "from every team" can reach many people without
   * hours there (#328): their lines are capped, the rest counted in one line.
   */
  const ORG_HINTS = 5;
  const orgHints = $derived(hintItems.filter((h) => h.areaId === ORG_UNIT));
  const shownHints = $derived.by(() => {
    const shown = new Set(orgHints.slice(0, ORG_HINTS));
    return hintItems.filter((h) => h.areaId !== ORG_UNIT || shown.has(h));
  });
  /** Hints of areas only, of the organisation only (worded for it), or of both. */
  const hintsTitle = $derived(
    orgHints.length === 0
      ? $t('load.hints')
      : orgHints.length === hintItems.length
        ? areaText($t, $levels, ORG_UNIT)('load.hints')
        : $t('load.hints.both'),
  );
  const moreOrgHints = $derived(Math.max(0, orgHints.length - ORG_HINTS));

  /** Up to this many weeks are named; more are summed up as a span. */
  const NAMED_WEEKS = 4;

  /** One line per person: for each kind of warning its weeks and the most hours among them. */
  const warningItems = $derived.by(() => {
    const byMonday = new Map(weeks.map((w) => [w.monday, w]));
    const inScope = scopePeople($workspace, $filter);
    const groups = record<{ personId: string; kinds: Record<string, string[]> }>();
    for (const w of allWarnings) {
      if (!inScope.has(w.personId)) continue;
      const group = (groups[w.personId] ??= { personId: w.personId, kinds: record() });
      (group.kinds[w.kind] ??= []).push(w.monday);
    }
    const list = new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' });
    const { warnFactor, maxFte } = $workspace.settings.thresholds;
    /** Each named week becomes a link: a marker in the text, split out again below. */
    const mark = (i: number): string => `\uE000${i}\uE000`;
    const label = (mondays: string[]): string[] => {
      // Week numbers repeat on horizons longer than a year: then the Mondays are named instead.
      const labels = mondays.map(weekLabel);
      return new Set(labels).size === labels.length
        ? labels
        : mondays.map((m) => formatDisplayDate($locale, m, 'short'));
    };
    return Object.values(groups).map((g) => {
      const links: { monday: string; label: string }[] = [];
      const link = (monday: string, text: string): string => {
        links.push({ monday, label: text });
        return mark(links.length - 1);
      };
      const parts = (['above-usual', 'above-fte'] as const)
        .filter((kind) => g.kinds[kind])
        .map((kind) => {
          const mondays = g.kinds[kind]!;
          const named = label(mondays);
          const hoursThen = (m: string): number => byMonday.get(m)?.byPerson[g.personId] ?? 0;
          const most = Math.max(...mondays.map(hoursThen));
          return $t(`load.warn.${kind}`, {
            factor: formatNumber($locale, warnFactor, 1),
            limit: formatPercent($locale, maxFte),
            weeks:
              named.length > NAMED_WEEKS
                ? $t('load.warn.span', {
                    count: formatNumber($locale, named.length, 0),
                    first: link(mondays[0]!, named[0]!),
                    last: link(mondays[mondays.length - 1]!, named[named.length - 1]!),
                  })
                : // `label` keeps the order of `mondays`: named[i] is the label of mondays[i].
                  list.format(named.map((n, i) => link(mondays[i]!, n))),
            hours: hours(most),
          });
        });
      const person = $workspace.people.find((p) => p.id === g.personId)?.name ?? g.personId;
      const text = $t('load.warn.person', { person, parts: parts.join('; ') });
      return {
        key: g.personId,
        person,
        segments: text
          .split(/\uE000(\d+)\uE000/)
          .map((part, i) => (i % 2 === 1 ? links[Number(part)]! : { label: part })),
      };
    });
  });

  /**
   * The overlaps of the people in scope by meeting pair (#445), in the area Overview's window, so
   * both count the same. Only pairs that touch the units in scope, unless a person is chosen.
   */
  const OVERLAP_ROWS = 50;
  let overlapsBox: HTMLElement | undefined = $state();
  // Brought into view when asked for from the area Overview (#445).
  $effect(() => {
    if (!$loadOverlaps || !overlapsBox) return;
    loadOverlaps.set(false);
    void tick().then(() => overlapsBox?.scrollIntoView({ block: 'start' }));
  });
  const overlapWindow = $derived(overviewWindow($workspace.settings.horizon, localToday()));
  const overlaps = $derived.by(() => {
    const ws = $workspace;
    const { from, weeks } = overlapWindow;
    const units = $filter.personId ? undefined : new Set(scopeUnits(ws, $filter).map((u) => u.id));
    return overlapPairs(
      clashes(ws, $index, scopePeople(ws, $filter), {
        from,
        to: addDays(from, weeks * 7),
        units,
      }),
    );
  });

  // ---------- summary tiles and chart ----------

  const totalHours = $derived(summary.byRole.reduce((sum, r) => sum + r.hours, 0));
  const rows = $derived(weekRows($workspace, $index, $filter));
  const average = $derived(
    rows.length > 0 ? rows.reduce((sum, r) => sum + r.total, 0) / rows.length : 0,
  );
  const peak = $derived(
    rows.reduce<(typeof rows)[number] | undefined>(
      (best, r) => (r.total > 0 && (!best || r.total > best.total) ? r : best),
      undefined,
    ),
  );
  const warned = $derived(warnedWeeks($workspace, allWarnings, $filter));
  const chartLabel = $derived(
    peak
      ? $t('load.chart.label', {
          from: weekLabel(rows[0]!.monday),
          to: weekLabel(rows[rows.length - 1]!.monday),
          avg: hours(average),
          peak: weekLabel(peak.monday),
          max: hours(peak.total),
          warned: formatNumber($locale, rows.filter((r) => warned.has(r.monday)).length, 0),
        })
      : '',
  );

  const rate = $derived($workspace.settings.hourlyRate);
  const costs = $derived(rate ? costSummary($workspace, $index, $filter, rate) : null);
  /** A team's people in its area's meetings, on top (#336); not with a role or person filter. */
  const share = $derived(
    teamId && !$filter.roleId ? areaShare($workspace, $index, teamId, rate) : undefined,
  );
  const scopeTeam = $derived($workspace.teams.find((x) => x.id === teamId));
  const unitLabel = $derived(scopeTeam?.name);

  const uid = $props.id();
  /** The phone layout of the people table (#447): same breakpoint as its CSS. */
  const phone = new MediaQuery('max-width: 600px');
</script>

<div class="load stack">
  <p class="note only" data-meeting-only>{$t('load.meetingOnly')}</p>
  <WeekFocus />
  {#if summary.byCategory.length === 0 && summary.byRole.length === 0}
    <p class="hint card">{$t('load.empty')}</p>
  {/if}

  {#snippet region(id: string, title: string, body: import('svelte').Snippet)}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
    <div class="scroll" role="region" aria-labelledby="{uid}-{id}" tabindex="0">
      <!-- Explicit roles: the people rows are drawn as grids on phones (#447), which some
           browsers (Safari) take as losing the table semantics. -->
      <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
      <table role="table">
        <caption id="{uid}-{id}">{title}</caption>
        {@render body()}
      </table>
    </div>
  {/snippet}

  <!-- `week` names the week when `label` is a date and contains that date, so the visible text stays part of the name (#375). -->
  {#snippet weekLink(
    personId: string,
    person: string,
    monday: string,
    label: string,
    week: string = label,
  )}
    {#if onOpenWeek}<button
        type="button"
        class="week-link"
        aria-label={$t('load.openWeek', { week, person })}
        title={$t('load.openWeek', { week, person })}
        onclick={() => onOpenWeek(personId, monday)}>{label}</button
      >{:else}{label}{/if}
  {/snippet}

  {#snippet unitLine(u: ReturnType<typeof unitsOf>[number])}
    <span class="unit-name">{u.name}</span>
    <span class="muted"
      >{[...u.roles, $t('load.detail.hours', { hours: hours(u.hours) })].join(' · ')}</span
    >
    <span class="num"
      >{u.meetings > 0
        ? $t('load.detail.meetings', { hours: hours(u.meetings) })
        : $t('load.detail.noMeetings')}</span
    >
  {/snippet}

  {#snippet baseBody()}
    <thead>
      <tr>
        <th scope="col" class="start">{$t('load.col.category')}</th>
        {#each summary.byRole as r (r.roleId)}
          <th scope="col" class="num">{roleName(r.roleId)}</th>
        {/each}
        <th scope="col" class="num total">{$t('load.col.total')}</th>
      </tr>
    </thead>
    <tbody>
      {#each summary.byCategory as c (c.categoryId)}
        <tr data-category={c.categoryId}>
          <th scope="row" class="nowrap start">
            <span class="cat"
              ><span
                class="dot"
                aria-hidden="true"
                style:background={$workspace.categories.find((x) => x.id === c.categoryId)?.colour}
              ></span>{categoryName(c.categoryId)}</span
            >
          </th>
          {#each summary.byRole as r (r.roleId)}
            <td class="num">{hours(summary.matrix[c.categoryId]?.[r.roleId] ?? 0)}</td>
          {/each}
          <td class="num total">{hours(c.hours)}</td>
        </tr>
      {/each}
    </tbody>
  {/snippet}

  {#snippet personBody()}
    <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
    <thead role="rowgroup">
      <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
      <tr role="row">
        <th scope="col" role="columnheader">{$t('load.col.person')}</th>
        <th scope="col" role="columnheader">{$t('load.col.units')}</th>
        <th scope="col" role="columnheader" class="num">{$t('load.col.hours')}</th>
        <th
          scope="col"
          role="columnheader"
          class="sortable"
          aria-sort={sortBy === 'share' ? 'descending' : undefined}
        >
          <button type="button" class="sort" onclick={() => (sortBy = 'share')}
            >{$t('load.col.fte')}{#if sortBy !== 'share'}<span class="sr-only"
                >, {$t('load.sort')}</span
              >{/if}{#if sortBy === 'share'}<span aria-hidden="true"> ↓</span>{/if}</button
          >
        </th>
        {#if showHere}
          <th scope="col" role="columnheader" class="num"
            >{$t(area ? 'load.col.hereArea' : 'load.col.here')}</th
          >
        {/if}
        <th
          scope="col"
          role="columnheader"
          class="num sortable"
          aria-sort={sortBy === 'free' ? 'descending' : undefined}
        >
          <button type="button" class="sort" onclick={() => (sortBy = 'free')}
            >{$t('load.col.free')}{#if sortBy !== 'free'}<span class="sr-only"
                >, {$t('load.sort')}</span
              >{/if}{#if sortBy === 'free'}<span aria-hidden="true"> ↓</span>{/if}</button
          >
        </th>
        <th scope="col" role="columnheader" class="num">{$t('load.col.peak')}</th>
      </tr>
    </thead>
    <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
    <tbody role="rowgroup">
      {#each sorted as p (p.person.id)}
        {@const over = overMax(p.average, p.cap, maxFte)}
        <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
        <tr role="row" data-person={p.person.id} class:open={openPerson === p.person.id}>
          <th scope="row" role="rowheader">
            <button
              type="button"
              class="who"
              aria-expanded={openPerson === p.person.id}
              aria-controls="{uid}-detail-{p.person.id}"
              onclick={() => (openPerson = openPerson === p.person.id ? null : p.person.id)}
              >{p.person.name}</button
            >
            {#if over}<span class="over-tag">{$t('load.over')}</span>{/if}
            {#if overbooked($workspace, p.person.id)}
              {@const total = weekly(capacity($workspace, p.person.id))}
              <span class="overbooked" data-overbooked
                ><span class="long"
                  >{$t('team.people.over', { hours: total, max: weekly(hpw) })}</span
                ><span class="short" aria-hidden="true"
                  >{$t('team.people.overShort', { hours: total, max: weekly(hpw) })}</span
                ></span
              >
            {/if}
          </th>
          <td role="cell" class="units"
            >{p.units.length === 0
              ? '–'
              : p.units.every((u) => u.id === ORG_UNIT)
                ? areaText($t, $levels, ORG_UNIT)('load.onlyArea')
                : p.units.every((u) => u.area)
                  ? $t('load.onlyArea')
                  : p.units
                      .filter((u) => !u.area)
                      .map((u) => u.name)
                      .join(', ')}</td
          >
          <td role="cell" class="num nowrap hours"
            >{$t('load.hoursOf', { hours: hours(p.average), of: hours(p.cap) })}</td
          >
          <td role="cell" class="nowrap share-cell">
            <span class="share">
              <span class="bar" aria-hidden="true"
                ><i style:width="{barWidth(shareKey(p))}%" class:over></i><b></b></span
              >
              <span class="num" class:over
                >{noHours(p) ? $t('load.noHours') : formatPercent($locale, p.fte)}</span
              >
            </span>
          </td>
          {#if showHere}
            <td
              role="cell"
              class="num nowrap here"
              data-cap={$t(area ? 'load.col.hereArea' : 'load.col.here')}
              >{$t('load.here', {
                hours: hours(p.here.hours),
                of: hours(p.here.cap),
                percent:
                  p.here.cap > 0 || p.here.hours === 0
                    ? formatPercent($locale, p.here.share)
                    : $t('load.noHours'),
              })}</td
            >
          {/if}
          <td
            role="cell"
            class="num nowrap free"
            class:over={p.free < 0}
            data-cap={$t('load.col.free')}
            >{p.free < 0
              ? $t('load.freeHours.over', { hours: hours(-p.free) })
              : $t('load.freeHours', { hours: hours(p.free) })}</td
          >
          <td role="cell" class="num nowrap peak" data-cap={$t('load.col.peak')}>
            {#if p.peak}
              {@const [before, after] = $t('load.peak', {
                week: '\uE000',
                hours: hours(p.peak.hours),
              }).split('\uE000')}
              {before}{@render weekLink(
                p.person.id,
                p.person.name,
                p.peak.monday,
                weekLabel(p.peak.monday),
              )}{after}
            {:else}
              {$t('load.none')}
            {/if}
          </td>
        </tr>
        <!-- svelte-ignore a11y_no_redundant_roles (Safari, see above) -->
        <tr
          role="row"
          class="detail"
          id="{uid}-detail-{p.person.id}"
          hidden={openPerson !== p.person.id}
        >
          <td role="cell" colspan={showHere ? 7 : 6}>
            <!-- Stays in the visible part of a table that scrolls sideways (phones). -->
            <div class="detail-in">
              {#if openPerson === p.person.id}
                {#if noHours(p) && p.units.length > 0 && p.units.every((u) => u.area)}
                  <p class="note" data-set-hours>
                    {#if p.units.every((u) => u.id === ORG_UNIT)}
                      {$t('load.detail.setHoursOrg', { org: $t('view.org') })}
                    {:else}
                      {$t('load.detail.setHours', { structure: $t('area.view.structure') })}
                    {/if}
                  </p>
                {/if}
                {@const lines = [...p.units, ...invitedOf(p.person.id, p.units)]}
                {#if lines.length === 0}
                  <p class="note">{$t('load.detail.none')}</p>
                {:else}
                  <ul class="split">
                    {#each lines as u (u.id)}
                      {@const list = openMeetings[u.id]}
                      <li>
                        {#if list}
                          <!-- Collapsed per team or area: people in many of them keep a short list. -->
                          <details>
                            <summary class="line">{@render unitLine(u)}</summary>
                            <ul class="meetings">
                              {#each list as m (m.eventId)}
                                <li>
                                  <span>{m.name}</span>
                                  <span class="muted"
                                    >{m.rule}{#if m.oneOff}<span class="once"
                                        >{$t('load.detail.oneOff')}</span
                                      >{/if}</span
                                  >
                                  {#if m.oneOff}
                                    <span class="num nowrap"
                                      >{$t('load.detail.oneOffHours', { hours: hours(m.hours) })}
                                      <span class="spread"
                                        >{$t('load.detail.oneOffAvg', {
                                          // Two digits: a one-off over the horizon is often below 0.1 h a week.
                                          hours: formatNumber($locale, m.hoursPerWeek, 2),
                                        })}</span
                                      ></span
                                    >
                                  {:else}
                                    <span class="num nowrap"
                                      >{$t('load.detail.perWeek', {
                                        hours: hours(m.hoursPerWeek),
                                      })}</span
                                    >
                                  {/if}
                                </li>
                              {/each}
                            </ul>
                          </details>
                        {:else}
                          <div class="line">{@render unitLine(u)}</div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  {/snippet}

  <ul class="tiles" aria-label={$t('load.summary')}>
    <li class="tile" data-total>
      <span class="label">{$t('load.kpi.total')}</span>
      <span class="value">{hours(totalHours)} <small>{$t('load.kpi.unit.typical')}</small></span>
      <span class="sub"
        >{$filter.personId
          ? ''
          : $t('load.kpi.fte', { n: formatNumber($locale, fte(totalHours, hpw), 2) })}
        {#if summary.unfilled > 0}<span class="unfilled" data-unfilled
            >{$t(summary.unfilled === 1 ? 'load.kpi.unfilled.one' : 'load.kpi.unfilled', {
              n: formatNumber($locale, summary.unfilled, 0),
            })}</span
          >{/if}</span
      >
    </li>
    {#each summary.byRole as r (r.roleId)}
      <li class="tile" data-role={r.roleId}>
        <span class="label">{roleName(r.roleId)}</span>
        <span class="value"
          ><span class="hours">{hours(r.hours)}</span>
          <small>{$t('load.kpi.unit.typical')}</small></span
        >
        <span class="meter" aria-hidden="true"
          ><span style:width="{Math.min(100, r.percent)}%"></span></span
        >
        <span class="sub"
          >{$t(
            $filter.personId
              ? 'load.kpi.share.person'
              : r.people > 1
                ? 'load.kpi.share.many'
                : 'load.kpi.share',
            {
              percent: formatPercent($locale, r.percent / 100),
              hours: weekly(r.weekly),
              people: formatNumber($locale, r.people, 0),
              fte: formatNumber($locale, r.fte, 2),
            },
          )}</span
        >
      </li>
    {/each}
    <li class="tile" data-peak>
      <span class="label">{$t('load.kpi.peak')}</span>
      {#if peak}
        <span class="value">{weekLabel(peak.monday)}</span>
        <span class="sub">{$t('load.kpi.peak.hours', { hours: hours(peak.total) })}</span>
      {:else}
        <span class="value">–</span>
        <span class="sub">{$t('load.kpi.peak.none')}</span>
      {/if}
    </li>
  </ul>

  {#if summary.byRole.length > 0}
    <p class="note basis" data-basis>{$t('load.kpi.basis')}</p>
  {/if}

  {#if peak}
    <section class="card" aria-labelledby="{uid}-chart">
      <h3 id="{uid}-chart">{$t('load.chart')}</h3>
      <p class="note">{$t('load.chart.hint')}</p>
      <div class="chart" role="img" aria-label={chartLabel}>
        <div class="plot">
          <div class="avg" style:bottom="{(average / peak.total) * 100}%">
            <span>{$t('load.chart.avg', { hours: hours(average) })}</span>
          </div>
          <div class="bars">
            {#each rows as row (row.monday)}
              <i
                class:high={warned.has(row.monday)}
                style:height="{(row.total / peak.total) * 100}%"
              ></i>
            {/each}
          </div>
        </div>
      </div>
      <div class="axis" aria-hidden="true">
        <span>{weekLabel(rows[0]!.monday)}</span>
        <span>{weekLabel(rows[Math.floor(rows.length / 2)]!.monday)}</span>
        <span>{weekLabel(rows[rows.length - 1]!.monday)}</span>
      </div>
    </section>
  {/if}
  {#snippet peopleCard()}
    {#if $workspace.people.length > 0}
      <section class="card people">
        {#if roleId && people.length === 0}
          <p class="note" data-no-role>{$t('load.table.person.noRole')}</p>
        {:else}{@render region(
            'person',
            roleId
              ? $t('load.table.person.role', {
                  role: roleName(roleId),
                  count: formatNumber($locale, people.length, 0),
                })
              : $t('load.table.person'),
            personBody,
          )}{/if}
        <p class="note below">
          {#if !$filter.personId}
            {area
              ? $t('load.table.person.noteArea', { name: area.name })
              : showHere
                ? $t('load.table.person.note')
                : ''}
          {/if}
          {$t('load.table.person.free', { max: formatPercent($locale, maxFte) })}
        </p>
      </section>
    {/if}
  {/snippet}
  <!-- Phones: the people answer the reader's question, so they come before the warnings (#447);
       in the source too, so reading and Tab order follow the screen. -->
  {#if phone.current}{@render peopleCard()}{/if}
  <section class="card" aria-labelledby="{uid}-warn">
    <h3 id="{uid}-warn">
      {$t('load.warnings')}
      {#if warningItems.length + overlaps.length > 0}<span class="count" aria-hidden="true"
          >{warningItems.length + overlaps.length}</span
        >{/if}
    </h3>
    <p class="note">
      {$t('load.warnings.rule', {
        factor: formatNumber($locale, $workspace.settings.thresholds.warnFactor, 1),
        limit: formatPercent($locale, $workspace.settings.thresholds.maxFte),
        period: nextWeeks($t, $locale, overlapWindow.weeks),
      })}
    </p>
    {#if warningItems.length + overlaps.length === 0}
      <p class="note">{$t('load.warnings.none')}</p>
    {/if}
    {#if warningItems.length > 0}
      <ul class="warnings">
        {#each warningItems as w (w.key)}
          <li class="warning">
            <span
              >{#each w.segments as part, i (i)}{#if 'monday' in part}{@render weekLink(
                    w.key,
                    w.person,
                    part.monday,
                    part.label,
                  )}{:else}{part.label}{/if}{/each}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
    {#if overlaps.length > 0}
      <h4 class="hints-title">{$t('load.overlaps')}</h4>
      <div class="overlaps" bind:this={overlapsBox}>
        <!-- A whole line can have thousands of pairs: the first ones, then all (#316 budget);
             another scope starts with the first ones again. -->
        {#key `${$filter.teamId}/${$filter.roleId}/${$filter.personId}`}
          <OverlapList
            pairs={overlaps}
            weeks={overlapWindow.weeks}
            limit={OVERLAP_ROWS}
            onOpen={onOpenWeek}
          />
        {/key}
      </div>
    {/if}
    {#if hintItems.length > 0}
      <h4 class="hints-title">
        {hintsTitle}
      </h4>
      {#if orgHints.length < hintItems.length}<p class="note">{$t('load.hints.rule')}</p>{/if}
      {#if orgHints.length > 0}<p class="note">
          {$t('load.hints.ruleOrg', { org: $t('view.org') })}
        </p>{/if}
      <ul class="hints" data-area-hints>
        {#each shownHints as h (h.key)}
          <li>
            {h.text}
            {#if onOpenStructure}
              <span data-no-print data-no-present
                >·
                <button
                  type="button"
                  class="week-link"
                  aria-label={h.label}
                  onclick={() => onOpenStructure(h.areaId, h.personId)}
                  >{$t('area.participants.setHours')}</button
                ></span
              >{/if}
          </li>
        {/each}
        {#if moreOrgHints > 0}
          <li data-more-hints>
            {$t(moreOrgHints === 1 ? 'load.hint.moreOrg.one' : 'load.hint.moreOrg.other', {
              n: formatNumber($locale, moreOrgHints, 0),
            })}
          </li>
        {/if}
      </ul>
    {/if}
  </section>

  {#if !phone.current}{@render peopleCard()}{/if}

  <!-- More than three roles: the base load takes the full width, so more of them show (#469). -->
  <div class="grid" class:wide={summary.byRole.length > 3}>
    <div class="col">
      <div class="card">{@render region('base', $t('load.table.base'), baseBody)}</div>
    </div>
    <div class="col">
      {#if costs && rate}
        <CostCard
          summary={costs}
          {rate}
          cadence={scopeTeam?.cadence}
          areaShare={share}
          unitName={unitLabel}
        />
      {:else if !rate && summary.byRole.length > 0}
        <RateInvite />
      {/if}
    </div>
  </div>
</div>

<style>
  .load {
    min-width: 0;
  }
  .hint {
    margin: 0;
  }
  /* ---------- tiles ---------- */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Each tile spans four rows of the list's grid (subgrid), so labels, values, meters and
     sub-lines line up across tiles even when a role name wraps or a tile has no meter. */
  .tile {
    display: grid;
    grid-row: span 4;
    grid-template-rows: subgrid;
    row-gap: 0.3rem;
    align-content: start;
    padding: 1.1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .label {
    grid-row: 1;
    align-self: end;
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .value {
    grid-row: 2;
    font-size: 1.6rem;
    font-weight: 780;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .value small {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .sub {
    grid-row: 4;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .sub .unfilled {
    display: block;
    margin-top: 0.15rem;
  }
  .meter {
    grid-row: 3;
    align-self: center;
    display: block;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
    overflow: hidden;
  }
  .meter > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-gradient);
  }
  /* ---------- two columns ---------- */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .grid.wide {
    grid-template-columns: minmax(0, 1fr);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }
  .card {
    min-width: 0;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.25rem;
  }
  .count {
    padding: 0 0.5rem;
    border-radius: 999px;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.8rem;
    font-weight: 700;
  }
  /* The line belongs to the tiles above it: it sits closer to them than the stack's gap. */
  .note.basis {
    margin: -0.5rem 0 0;
  }
  .note.below {
    margin: 0.75rem 0 0;
  }
  /* Says what the page counts, right under its title. */
  .note.only {
    margin: 0;
  }
  .note {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  /* ---------- chart ---------- */
  /* The top padding is room for the average label: it sits above its line, and the line reaches
     the top of the plot when every week has the same load. */
  .chart {
    margin-top: 0.5rem;
    padding-top: 1.4rem;
  }
  .plot {
    position: relative;
    height: 9rem;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    /* Long horizons (up to five years) must still fit: the gap shrinks with the width. */
    gap: clamp(0px, 0.4%, 2px);
    height: 100%;
    /* With hundreds of weeks on a narrow screen the gaps alone are wider than the plot. */
    overflow-x: clip;
  }
  .bars i {
    flex: 1;
    min-width: 0;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    background: var(--brand-gradient);
    opacity: 0.85;
  }
  .bars i.high {
    background: var(--hot);
    opacity: 1;
  }
  .avg {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 1;
    border-top: 2px dashed var(--text-muted);
    pointer-events: none;
  }
  .avg span {
    position: absolute;
    right: 0;
    bottom: 0.2rem;
    padding: 0 0.35rem;
    border-radius: 0.3rem;
    background: var(--surface);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  /* ---------- tables ---------- */
  .scroll {
    position: relative;
    overflow-x: auto;
    container-type: inline-size;
  }
  .detail-in {
    position: sticky;
    left: 0;
    max-width: calc(100cqi - 1.5rem);
  }
  table {
    width: 100%;
  }
  caption {
    text-align: left;
  }
  th,
  td {
    text-align: left;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .total {
    font-weight: 700;
  }
  /* Category and Total stay in view while many role columns scroll between them (#469). */
  :global(#app) [role='region'] table :is(th, td).total {
    position: sticky;
    right: 0;
    box-shadow: inset 1px 0 0 var(--border);
  }
  /* On phones a sticky Category would leave hardly any room for the roles. */
  @media (min-width: 601px) {
    :global(#app) [role='region'] table th.start {
      position: sticky;
      left: 0;
      box-shadow: inset -1px 0 0 var(--border);
    }
  }
  :global(#app) [role='region'] table tbody :is(td.total, th.start) {
    background: var(--surface);
  }
  :global(#app) [role='region'] table tbody tr:hover > :is(td.total, th.start) {
    background: var(--surface-2);
  }
  .nowrap {
    white-space: nowrap;
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }
  /* ---------- people ---------- */
  :global(#app) .people button.who,
  :global(#app) .people button.sort {
    min-height: 1.5rem;
    padding: 0.15rem 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    text-align: left;
    cursor: pointer;
  }
  :global(#app) .people button.sort {
    text-transform: inherit;
    letter-spacing: inherit;
    font-size: inherit;
    color: inherit;
  }
  :global(#app) .people button.who {
    font-weight: 650;
    text-decoration: underline;
    text-decoration-color: var(--border);
    text-underline-offset: 0.2em;
  }
  :global(#app) .people button.who:hover {
    text-decoration-color: currentColor;
  }
  .people tr.open > *,
  .people tr.open + tr.detail > * {
    background: var(--accent-soft);
  }
  /* The hidden detail row is the last row: the last person row has no line under it either. */
  .people tbody tr[data-person]:nth-last-child(2) > * {
    border-bottom: 0;
  }
  .over-tag {
    margin-left: 0.4rem;
    padding: 0.05rem 0.45rem;
    border-radius: 99px;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.75rem;
    font-weight: 650;
    white-space: nowrap;
  }
  .overbooked {
    display: block;
    margin-top: 0.15rem;
    color: var(--warn);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .overbooked .short {
    display: none;
  }
  /* Phones: the short form fits the narrow name column; the sentence stays for screen readers. */
  @media (max-width: 600px) {
    .overbooked .short {
      display: inline;
      white-space: nowrap;
    }
    .overbooked .long {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .units {
    color: var(--text-muted);
  }
  .share {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }
  .share .num {
    min-width: 3rem;
  }
  .num.over {
    color: var(--warn);
    font-weight: 700;
  }
  /* Phones: each person is one stacked row like the cards of the area Overview (#283, #447):
     name and share on top, teams and hours, then room and peak week with their column names.
     The two sort buttons stay visible; the other column names are for screen readers only. */
  @media (max-width: 600px) {
    .people thead tr {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.6rem;
    }
    .people thead th:not(.sortable) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    :global(#app) .people thead th.sortable {
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
    }
    .people tbody tr[data-person] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'who share'
        'units hours'
        'free peak'
        'here here';
      column-gap: 0.75rem;
      row-gap: 0.15rem;
      margin-bottom: 0.6rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
    }
    :global(#app) .people tbody :is(tr[data-person], tr.detail) > * {
      padding: 0;
      border: 0;
      background: none;
    }
    .people tbody tr[data-person] > th {
      grid-area: who;
    }
    .people .share-cell {
      grid-area: share;
    }
    .people .units {
      grid-area: units;
      font-size: 0.875rem;
    }
    .people .hours {
      grid-area: hours;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .people .free {
      grid-area: free;
      margin-top: 0.35rem;
      text-align: left;
      font-weight: 650;
    }
    .people .peak {
      grid-area: peak;
      margin-top: 0.35rem;
    }
    .people .here {
      grid-area: here;
      margin-top: 0.35rem;
      text-align: left;
    }
    .people [data-cap]::before {
      content: attr(data-cap) / '';
      display: block;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 600;
      white-space: normal;
    }
    .people .share .bar {
      width: 3.5rem;
    }
    .people .share .num {
      min-width: 0;
    }
    /* The open person and their breakdown read as one card. */
    .people tbody tr.open {
      margin-bottom: 0;
      border-bottom: 0;
      border-radius: var(--radius) var(--radius) 0 0;
      background: var(--accent-soft);
    }
    .people tbody tr.detail:not([hidden]) {
      display: block;
      margin-bottom: 0.6rem;
      padding: 0.5rem 0.75rem 0.75rem;
      border: 1px solid var(--border);
      border-top: 0;
      border-radius: 0 0 var(--radius) var(--radius);
      background: var(--accent-soft);
    }
    .people tbody tr.detail > td {
      display: block;
    }
    .people .detail-in {
      position: static;
      max-width: none;
    }
  }
  .hints-title {
    margin: 1rem 0 0;
    font-size: 0.9375rem;
  }
  .hints-title + .overlaps {
    margin-top: 0.5rem;
  }
  .hints {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding-left: 1.1rem;
  }
  .bar {
    position: relative;
    display: block;
    width: 6rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-gradient);
  }
  .bar i.over {
    background: var(--warn);
  }
  /* The limit sits at two thirds of the scale (0 to 1.5 × the limit), as in the area overview. */
  .bar b {
    position: absolute;
    left: 66.67%;
    top: -0.2rem;
    bottom: -0.2rem;
    width: 2px;
    border-radius: 1px;
    background: var(--text);
  }
  @media (forced-colors: active) {
    .bar {
      border: 1px solid CanvasText;
    }
    .bar i,
    .bar b {
      background: CanvasText;
    }
  }
  .split {
    display: grid;
    gap: 0.35rem;
    margin: 0.25rem 0;
    padding: 0;
    list-style: none;
  }
  /* The chevron column keeps lines with and without a meeting list aligned. */
  .line,
  .meetings li {
    display: grid;
    grid-template-columns: 1rem minmax(7rem, 13rem) 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
  }
  .line > :first-child,
  .meetings li > :first-child {
    grid-column: 2;
  }
  summary.line {
    min-height: 1.75rem;
    cursor: pointer;
    list-style: none;
  }
  summary.line::-webkit-details-marker {
    display: none;
  }
  summary.line::before {
    content: '';
    grid-column: 1;
    grid-row: 1;
    justify-self: center;
    align-self: center;
    width: 0.4em;
    height: 0.4em;
    border: solid var(--text-muted);
    border-width: 0 2px 2px 0;
    transform: rotate(-45deg);
  }
  details[open] > summary.line::before {
    transform: rotate(45deg);
  }
  summary.line:hover .unit-name {
    text-decoration: underline;
  }
  .meetings {
    display: grid;
    gap: 0.25rem;
    margin: 0.25rem 0 0.5rem;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }
  .once {
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border-radius: 99px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  :global(#app) .week-link {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  /* Phones: the meeting's rule goes under its name, the hours stay on the right. */
  @media (max-width: 600px) {
    .line,
    .meetings li {
      grid-template-columns: 1rem 1fr auto;
      column-gap: 0.5rem;
      row-gap: 0;
    }
    .line > .muted,
    .meetings li > .muted {
      grid-column: 2;
      grid-row: 2;
    }
    .line > .num,
    .meetings li > .num {
      grid-column: 3;
      grid-row: 1;
    }
    .meetings .spread {
      display: block;
    }
  }
  .unit-name {
    font-weight: 600;
  }
  .muted {
    color: var(--text-muted);
  }

  /* ---------- warnings ---------- */
  .warnings {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .warning {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--text);
  }
  .warning::before {
    content: '⚠';
    color: var(--warn);
    font-weight: 700;
  }
  @media (forced-colors: active) {
    .meter,
    .bars i {
      border: 1px solid CanvasText;
    }
    .meter > span,
    .bars i {
      background: CanvasText;
    }
    .bars i.high {
      background: Highlight;
      border-color: Highlight;
    }
    .avg {
      border-top-color: CanvasText;
    }
    .warning {
      border: 1px solid CanvasText;
    }
  }
</style>
