<script lang="ts">
  import ImpactTag from '../components/ImpactTag.svelte';
  import { areaShare } from '../../core/areaCosts';
  import { weeklyLimit } from '../../core/line';
  import { costSummary } from '../../core/cost';
  import { isoWeek, weekday } from '../../core/date';
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
    warnings,
    type PersonMeeting,
  } from '../../core/load';
  import { contextHint, contextHints, contextThreshold } from '../../core/contextSwitch';
  import {
    keyName,
    lineSelection,
    lineUnitsById,
    selectedLineUnit,
    units as allUnits,
    unitLoadIds,
  } from '../../core/model';
  import UnitChip from '../components/UnitChip.svelte';
  import { record } from '../../core/record';
  import {
    clashes,
    clashTime,
    loadSummary,
    scopePeople,
    warnedWeeks,
    weekRows,
  } from '../../core/views';
  import {
    formatDisplayDate,
    formatNumber,
    formatPercent,
    levels,
    locale,
    translate as t,
  } from '../../i18n';
  import CostCard from '../components/CostCard.svelte';
  import RateInvite from '../components/RateInvite.svelte';
  import WeekFocus from '../components/WeekFocus.svelte';
  import { ruleSummary, weekdayShort } from '../meetings/rules';
  import { presenting } from '../state/present';
  import { activeTeamId, filter, index, workspace } from '../state/workspace';

  interface Props {
    /** Opens a week in the Calendar with the Person filter on that person (#343). */
    onOpenWeek?: (personId: string, monday: string) => void;
  }
  let { onOpenWeek }: Props = $props();

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
  /**
   * The unit whose part the table shows in its own column. A line unit (#316) has none: its
   * people's meetings everywhere are its part, the same as the share column.
   */
  const hereId = $derived(selectedLineUnit(teamId) === undefined ? teamId : undefined);
  /**
   * Cross links (#397): in the products each person's line unit, in the line the products each
   * person works in. Only while the file has a line.
   */
  const hasLine = $derived(($workspace.lineUnits?.length ?? 0) > 0);
  const inLineWorld = $derived(selectedLineUnit($activeTeamId) !== undefined);
  const lineUnitById = $derived(lineUnitsById($workspace, $levels.org));
  /** The team's id, or an area's teams and the area itself (its own meetings count there). */
  const teamIds = $derived(teamId ? unitLoadIds($workspace, teamId) : undefined);
  const people = $derived(
    $filter.personId
      ? $workspace.people.filter((p) => p.id === $filter.personId)
      : teamId
        ? $workspace.people.filter((p) => scopePeople($workspace, { teamId }).has(p.id))
        : $workspace.people,
  );

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
        /** Hours per week that still fit into meetings before the limit (none without hours). */
        free: Math.max(0, maxFte * cap - average),
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
    const areas = ws.areas
      .filter(
        (a) =>
          a.members.some((m) => m.personId === personId) || Object.hasOwn(a.memberHours, personId),
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
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
    const areaIds = new Set(ws.areas.map((a) => a.id));
    return allUnits(ws)
      .filter((u) => !known.some((k) => k.id === u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
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
  /**
   * A big organisation (#315: ~500 people) shows the most loaded people first and the rest on
   * request: a table of every person would take seconds to build on a slow device.
   */
  const PERSON_ROWS = 50;
  let allPeople = $state(false);
  // Their teams and areas only for the rows shown (#323 budget: ~650 people at the target scale).
  const shownPeople = $derived(
    (allPeople ? sorted : sorted.slice(0, PERSON_ROWS)).map((p) => ({
      ...p,
      units: unitsOf(p.person.id),
    })),
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
  /** The person's assignments (#315) with the role they hold in the product. */
  function staffedOf(personId: string): { teamId: string; roleId: string }[] {
    const ws = $workspace;
    return (ws.assignments ?? []).flatMap((a) => {
      if (a.personId !== personId) return [];
      const roleId = ws.teams
        .find((x) => x.id === a.teamId)
        ?.demands?.find((d) => d.id === a.demandId)?.roleId;
      return roleId === undefined ? [] : [{ teamId: a.teamId, roleId }];
    });
  }
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
    const names = new Map(ws.people.map((p) => [p.id, p.name]));
    const nameOf = (id: string) => names.get(id) ?? id;
    return areaHints(weeks, ws)
      .filter((h) => inScope.has(h.personId) && (!area || h.areaId === area.id))
      .sort((a, b) => nameOf(a.personId).localeCompare(nameOf(b.personId), $locale))
      .map((h) => ({
        key: `${h.personId}/${h.areaId}`,
        text: $t(`load.hint.${h.kind}`, {
          person: nameOf(h.personId),
          area: ws.areas.find((a) => a.id === h.areaId)?.name ?? h.areaId,
          hours: hours(h.hours),
          share: formatPercent($locale, fte(h.hours, h.areaHours)),
          areaHours: weekly(h.areaHours),
        }),
      }));
  });

  /**
   * People in too many teams at once (#321): Weinberg's estimate, a hint next to the limit and
   * never part of it. While presenting only their number shows, without names.
   */
  const contextItems = $derived.by(() => {
    const ws = $workspace;
    const inScope = scopePeople(ws, $filter);
    return contextHints(ws)
      .filter((h) => inScope.has(h.personId))
      .map((h) => ({
        ...h,
        name: ws.people.find((p) => p.id === h.personId)?.name ?? h.personId,
      }))
      .sort((a, b) => b.teams - a.teams || a.name.localeCompare(b.name, $locale));
  });
  const contextFrom = $derived(contextThreshold($workspace));

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
   * One warning per person whose meetings clash in the planning horizon (#339): how many, between
   * which teams or areas, and the first one as an example. The calendar's overlap rule. Like the
   * people table, a whole line names the first ones and offers the rest (#316 budget).
   */
  const CLASH_ROWS = 50;
  let allClashes = $state(false);
  const clashPeople = $derived.by(() => {
    const ws = $workspace;
    const byPerson = record<ReturnType<typeof clashes>>();
    for (const c of clashes(ws, $index, scopePeople(ws, $filter)))
      (byPerson[c.personId] ??= []).push(c);
    const nameById = new Map(ws.people.map((p) => [p.id, p.name]));
    const collator = new Intl.Collator($locale);
    return Object.entries(byPerson)
      .map(([personId, found]) => ({ personId, found, person: nameById.get(personId) ?? personId }))
      .sort((a, b) => collator.compare(a.person, b.person));
  });
  const clashItems = $derived.by(() => {
    const ws = $workspace;
    const units = [...ws.areas, ...ws.teams];
    const list = new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' });
    const unitById = new Map(units.map((u) => [u.id, u]));
    const eventName = (o: { teamId: string; eventId: string }) =>
      unitById.get(o.teamId)?.events.find((e) => e.id === o.eventId)?.name ?? o.eventId;
    return (allClashes ? clashPeople : clashPeople.slice(0, CLASH_ROWS)).map(
      ({ personId, found, person }) => {
        const ids = new Set(found.flatMap((c) => [c.a.teamId, c.b.teamId]));
        const names = units.filter((u) => ids.has(u.id)).map((u) => u.name);
        const first = found[0]!;
        const time = clashTime(first);
        return {
          key: `clash/${personId}`,
          person,
          text: $t(names.length === 1 ? 'load.warn.clash.in' : 'load.warn.clash.between', {
            person,
            count: $t(found.length === 1 ? 'load.warn.clash.one' : 'load.warn.clash.other', {
              n: formatNumber($locale, found.length, 0),
            }),
            units: list.format(names),
            a: eventName(first.a),
            b: eventName(first.b),
            day: weekdayShort($locale, weekday(first.date)),
            date: formatDisplayDate($locale, first.date, 'short'),
            from: time.start,
            to: time.end,
          }),
        };
      },
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
  const unitLabel = $derived($workspace.teams.find((x) => x.id === teamId)?.name);

  const uid = $props.id();
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
      <table>
        <caption id="{uid}-{id}">{title}</caption>
        {@render body()}
      </table>
    </div>
  {/snippet}

  {#snippet weekLink(personId: string, person: string, monday: string, label: string)}
    {#if onOpenWeek}<button
        type="button"
        class="week-link"
        aria-label={$t('load.openWeek', { week: label, person })}
        title={$t('load.openWeek', { week: label, person })}
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
        <th scope="col">{$t('load.col.category')}</th>
        {#each summary.byRole as r (r.roleId)}
          <th scope="col" class="num">{roleName(r.roleId)}</th>
        {/each}
        <th scope="col" class="num">{$t('load.col.total')}</th>
      </tr>
    </thead>
    <tbody>
      {#each summary.byCategory as c (c.categoryId)}
        <tr data-category={c.categoryId}>
          <th scope="row" class="nowrap">
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
    <thead>
      <tr>
        <th scope="col">{$t('load.col.person')}</th>
        <th scope="col">{$t('load.col.units')}</th>
        <th scope="col" class="num">{$t('load.col.hours')}</th>
        <th scope="col" aria-sort={sortBy === 'share' ? 'descending' : undefined}>
          <button type="button" class="sort" onclick={() => (sortBy = 'share')}
            >{$t('load.col.fte')}{#if sortBy !== 'share'}<span class="sr-only"
                >, {$t('load.sort')}</span
              >{/if}{#if sortBy === 'share'}<span aria-hidden="true"> ↓</span>{/if}</button
          >
        </th>
        {#if hereId}
          <th scope="col" class="num">{$t(area ? 'load.col.hereArea' : 'load.col.here')}</th>
        {/if}
        <th scope="col" class="num" aria-sort={sortBy === 'free' ? 'descending' : undefined}>
          <button type="button" class="sort" onclick={() => (sortBy = 'free')}
            >{$t('load.col.free')}{#if sortBy !== 'free'}<span class="sr-only"
                >, {$t('load.sort')}</span
              >{/if}{#if sortBy === 'free'}<span aria-hidden="true"> ↓</span>{/if}</button
          >
        </th>
        <th scope="col" class="num">{$t('load.col.peak')}</th>
      </tr>
    </thead>
    <tbody>
      {#each shownPeople as p (p.person.id)}
        {@const over = overMax(p.average, p.cap, maxFte)}
        <tr data-person={p.person.id} class:open={openPerson === p.person.id}>
          <th scope="row">
            <button
              type="button"
              class="who"
              aria-expanded={openPerson === p.person.id}
              aria-controls="{uid}-detail-{p.person.id}"
              onclick={() => (openPerson = openPerson === p.person.id ? null : p.person.id)}
              >{p.person.name}</button
            >
            {#if over}<span class="over-tag">{$t('load.over')}</span>{/if}
            {#if !$presenting}
              {@const ctx = contextHint($workspace, p.person.id)}
              {#if ctx}<span class="context-tag" class:muted={ctx.overriddenIn} data-context-tag
                  >{$t('context.tag')}</span
                >{/if}
            {/if}
            {#if overbooked($workspace, p.person.id)}
              {@const total = weekly(capacity($workspace, p.person.id))}
              <span class="overbooked" data-overbooked
                ><span class="long"
                  >{$t('team.people.over', {
                    hours: total,
                    max: weekly(weeklyLimit($workspace, p.person.id)),
                  })}</span
                ><span class="short" aria-hidden="true"
                  >{$t('team.people.overShort', {
                    hours: total,
                    max: weekly(weeklyLimit($workspace, p.person.id)),
                  })}</span
                ></span
              >
            {/if}
          </th>
          <td class="units">
            <!-- Cross links (#397): the products in the line, the line unit in the products. -->
            {#if hasLine && inLineWorld && p.units.some((u) => !u.area)}
              <span class="cross">
                {#each p.units.filter((u) => !u.area) as u (u.id)}
                  <UnitChip selection={u.id} name={u.name} />
                {/each}
              </span>
            {:else}
              {p.units.length === 0
                ? '–'
                : p.units.every((u) => u.area)
                  ? $t('load.onlyArea')
                  : p.units
                      .filter((u) => !u.area)
                      .map((u) => u.name)
                      .join(', ')}
            {/if}
            {#if hasLine && !inLineWorld}
              {@const unit = lineUnitById.get(p.person.lineUnitId ?? '')}
              {#if unit}
                <span class="cross"
                  ><UnitChip selection={lineSelection(unit.id)} name={unit.name} line /></span
                >
              {/if}
            {/if}
          </td>
          <td class="num nowrap"
            >{$t('load.hoursOf', { hours: hours(p.average), of: hours(p.cap) })}</td
          >
          <td class="nowrap">
            <span class="share">
              <span class="bar" aria-hidden="true"
                ><i style:width="{barWidth(shareKey(p))}%" class:over></i><b></b></span
              >
              <span class="num" class:over
                >{noHours(p) ? $t('load.noHours') : formatPercent($locale, p.fte)}</span
              >
            </span>
          </td>
          {#if hereId}
            <td class="num nowrap"
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
          <td class="num nowrap">{$t('load.freeHours', { hours: hours(p.free) })}</td>
          <td class="num nowrap">
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
        <tr class="detail" id="{uid}-detail-{p.person.id}" hidden={openPerson !== p.person.id}>
          <td colspan={hereId ? 7 : 6}>
            <!-- Stays in the visible part of a table that scrolls sideways (phones). -->
            <div class="detail-in">
              {#if openPerson === p.person.id}
                {#if noHours(p) && p.units.length > 0 && p.units.every((u) => u.area)}
                  <p class="note" data-set-hours>
                    {$t('load.detail.setHours', { structure: $t('area.view.structure') })}
                  </p>
                {/if}
                {@const ctx = $presenting ? null : contextHint($workspace, p.person.id)}
                {#if ctx}
                  <p class="note context-detail" data-context-detail>
                    <strong
                      >{$t('context.title', { person: p.person.name, count: ctx.teams })}</strong
                    >
                    {$t('context.rule', {
                      count: ctx.teams,
                      loss: formatPercent($locale, ctx.loss),
                    })}
                    {#if ctx.overriddenIn}<span class="pill"
                        >{$t('context.overriddenIn', {
                          team:
                            $workspace.teams.find((x) => x.id === ctx.overriddenIn)?.name ??
                            ctx.overriddenIn,
                        })}</span
                      >{/if}
                  </p>
                {/if}
                {@const staffed = staffedOf(p.person.id)}
                {#if staffed.length > 0}
                  <!-- Each assignment against its Mindestzusage (#320); "über Grenze" stays the row's. -->
                  <ul class="staffed" data-staffed>
                    {#each staffed as a (a.teamId + a.roleId)}
                      <li>
                        <ImpactTag
                          ws={$workspace}
                          teamId={a.teamId}
                          personId={p.person.id}
                          roleId={a.roleId}
                          withTeam
                          short
                        />
                      </li>
                    {/each}
                  </ul>
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
      <span class="value">{hours(totalHours)} <small>{$t('load.kpi.unit')}</small></span>
      <span class="sub"
        >{$filter.personId
          ? $t('load.kpi.week.person')
          : $t('load.kpi.week', { n: formatNumber($locale, fte(totalHours, hpw), 2) })}
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
          ><span class="hours">{hours(r.hours)}</span> <small>{$t('load.kpi.unit')}</small></span
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
              hours: formatNumber($locale, r.weekly, 0),
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
  <section class="card" aria-labelledby="{uid}-warn">
    <h3 id="{uid}-warn">
      {$t('load.warnings')}
      {#if warningItems.length + clashPeople.length > 0}<span class="count" aria-hidden="true"
          >{warningItems.length + clashPeople.length}</span
        >{/if}
    </h3>
    <p class="note">
      {$t('load.warnings.rule', {
        factor: formatNumber($locale, $workspace.settings.thresholds.warnFactor, 1),
        limit: formatPercent($locale, $workspace.settings.thresholds.maxFte),
      })}
    </p>
    {#if warningItems.length + clashPeople.length === 0}
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
    {#if clashItems.length > 0}
      <h4 class="hints-title">{$t('load.overlaps')}</h4>
      <ul class="warnings overlaps">
        {#each clashItems as w (w.key)}
          <li class="warning" data-clash>{w.text}</li>
        {/each}
      </ul>
      {#if clashItems.length < clashPeople.length}
        <button
          type="button"
          class="secondary more"
          data-all-clashes
          onclick={() => (allClashes = true)}
          >{$t('load.overlaps.all', { n: formatNumber($locale, clashPeople.length, 0) })}</button
        >
      {/if}
    {/if}
    {#if contextItems.length > 0}
      <h4 class="hints-title">{$t('load.context')}</h4>
      <p class="note">{$t('load.context.rule', { from: contextFrom })}</p>
      {#if $presenting}
        <p class="context-anon" data-context-hints>
          {$t(contextItems.length === 1 ? 'load.context.anon.one' : 'load.context.anon.other', {
            n: formatNumber($locale, contextItems.length, 0),
            from: contextFrom,
          })}
        </p>
      {:else}
        <ul class="hints" data-context-hints>
          {#each contextItems as c (c.personId)}
            <li class:muted={c.overriddenIn}>
              {$t('load.context.item', {
                person: c.name,
                count: c.teams,
                loss: formatPercent($locale, c.loss),
              })}{#if c.overriddenIn}<span class="pill">{$t('context.overridden')}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    {#if hintItems.length > 0}
      <h4 class="hints-title">{$t('load.hints')}</h4>
      <p class="note">{$t('load.hints.rule')}</p>
      <ul class="hints" data-area-hints>
        {#each hintItems as h (h.key)}
          <li>{h.text}</li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if $workspace.people.length > 0}
    <section class="card people">
      {@render region('person', $t('load.table.person'), personBody)}
      {#if shownPeople.length < sorted.length}
        <button
          type="button"
          class="secondary more"
          data-all-people
          onclick={() => (allPeople = true)}
          >{$t('load.table.person.all', { n: formatNumber($locale, sorted.length, 0) })}</button
        >
      {/if}
      <p class="note below">
        {#if !$filter.personId}
          {area
            ? $t('load.table.person.noteArea', { name: area.name })
            : hereId
              ? $t('load.table.person.note')
              : ''}
        {/if}
        {$t('load.table.person.free', { max: formatPercent($locale, maxFte) })}
      </p>
    </section>
  {/if}

  <div class="grid">
    <div class="col">
      <div class="card">{@render region('base', $t('load.table.base'), baseBody)}</div>
    </div>
    <div class="col">
      {#if costs && rate}
        <CostCard summary={costs} {rate} areaShare={share} unitName={unitLabel} />
      {:else if !rate && summary.byRole.length > 0}
        <RateInvite />
      {/if}
    </div>
  </div>
</div>

<style>
  .staffed {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }
  .more {
    margin-top: calc(var(--space) * 0.75);
  }
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
  .cross {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.15rem;
  }
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
  .hints-title {
    margin: 1rem 0 0;
    font-size: 0.9375rem;
  }
  /* Context switching (#321): a hint, outlined so it never reads as the limit's warning. */
  .context-tag {
    margin-left: 0.4rem;
    padding: 0 0.45rem;
    border: 1px solid currentColor;
    border-radius: 99px;
    color: var(--warn);
    font-size: 0.75rem;
    font-weight: 650;
    white-space: nowrap;
  }
  .context-tag.muted,
  li.muted {
    color: var(--text-muted);
  }
  .pill {
    margin-left: 0.4rem;
    padding: 0 0.45rem;
    border: 1px solid var(--border-strong);
    border-radius: 99px;
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .context-anon {
    margin: 0;
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
