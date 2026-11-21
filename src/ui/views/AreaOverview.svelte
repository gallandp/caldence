<script lang="ts" module>
  /** Cost per week or in the planning horizon, kept while the app is open. */
  let rememberedPeriod: 'week' | 'horizon' = 'week';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { toStore } from 'svelte/store';
  import { areaCosts, costliest, meetingCosts } from '../../core/areaCosts';
  import type { UnfilledRole } from '../../core/cost';
  import {
    areaMeetingHours,
    areaOnlyLoad,
    areaOnlyPeople,
    compareCadences,
    compareOrgCadences,
    loadAverage,
    teamLoad,
    zeroHourMembers,
    type LoadCell,
    type Segment,
    type StepReason,
  } from '../../core/areaOverview';
  import { addDays, isoWeek, mondayOf, weekday, type ISODate } from '../../core/date';
  import {
    areaHours as hoursInArea,
    capacity,
    loadPerWeek,
    peopleOverLimit,
  } from '../../core/load';
  import { areaAsTeam, ORG_UNIT, type Area, type Cadence, type CalEvent } from '../../core/model';
  import { clashes, overlapPairs, overviewWindow } from '../../core/views';
  import {
    formatDisplayDate,
    formatEuro,
    formatNumber,
    formatPercent,
    areaText,
    levels,
    locale,
    nextWeeks,
    translate,
  } from '../../i18n';
  import { initials } from '../avatar';
  import AreaIcon from '../components/AreaIcon.svelte';
  import AreaMeetingWho from '../components/AreaMeetingWho.svelte';
  import OrgIcon from '../components/OrgIcon.svelte';
  import OverlapList from '../components/OverlapList.svelte';
  import RateInvite from '../components/RateInvite.svelte';
  import WhatIfSheet from '../components/WhatIfSheet.svelte';
  import { ruleShort, weekdayName, weekdayShort } from '../meetings/rules';
  import { index, localToday, workspace } from '../state/workspace';
  import { presenting } from '../state/present';

  /**
   * "Cadence & load" of an area (#168): the teams' cadences against the area cadence, their load
   * per week below on the same axis, and the area's own roles and meetings. It only compares.
   */
  interface Props {
    area: Area;
    /** Opens Load for one team, scrolled to one week. */
    onOpenLoad?: (teamId: string, monday: ISODate) => void;
    /** Opens Meeting load of an area at its overlapping meeting pairs. */
    onOpenOverlaps?: (areaId: string) => void;
    /** Opens a meeting of the area or one of its teams in Meetings & cadence. */
    onOpenMeeting?: (unitId: string, eventId: string) => void;
    /** Opens Meetings & cadence of a team or of the area. */
    onOpenUnit?: (unitId: string) => void;
    /** Opens the calendar's week of `date` with one person chosen. */
    onOpenCalendar?: (personId: string, date: ISODate) => void;
    /** Opens Meeting load of the area with one person's row open (#462). */
    onOpenPerson?: (personId: string) => void;
    /**
     * The organisation's page (#450): only the alignment, load and cost figures and the cost per
     * team; `children` (the tree) sits between the figures and the table.
     */
    summary?: boolean;
    children?: Snippet;
  }
  let {
    area,
    onOpenLoad,
    onOpenOverlaps,
    onOpenMeeting,
    onOpenUnit,
    onOpenCalendar,
    onOpenPerson,
    summary = false,
    children,
  }: Props = $props();

  /** For the organisation, "{levelArea}" and "{levelInArea}" name the organisation (#328). */
  const t = toStore(() => areaText($translate, $levels, area.id));
  const org = $derived(area.id === ORG_UNIT);

  const uid = $props.id();

  /** While presenting, each cadence row opens its what-if here; the coach stays on the Overview (#444). */
  let whatIf = $state.raw<{ unitId: string; opener: HTMLElement }>();
  const ws = $derived($workspace);
  const teams = $derived(area.teamIds.flatMap((id) => ws.teams.filter((x) => x.id === id)));

  /** The window starts this week, inside the horizon, and holds up to 12 weeks of it. */
  const span = $derived(overviewWindow(ws.settings.horizon, localToday()));
  const from = $derived(span.from);
  const weekCount = $derived(span.weeks);
  const mondays = $derived(Array.from({ length: weekCount }, (_, i) => addDays(from, i * 7)));

  // While presenting, the peer reference comes from the file as it was before the what-ifs (#470).
  const presentBase = workspace.presentBase;
  const saved = $derived($presentBase ?? ws);
  const orgComparison = $derived(
    summary ? compareOrgCadences(ws, from, weekCount, saved) : undefined,
  );
  const comparison = $derived(orgComparison ?? compareCadences(ws, area, from, weekCount, saved));
  const allWeeks = $derived(loadPerWeek(ws, $index));
  // The summary shows no heat map or warned weeks: no load per team and week (#450).
  const weeks = $derived.by(() => {
    if (summary) return [];
    const start = allWeeks.findIndex((w) => w.monday === from);
    return start < 0 ? [] : allWeeks.slice(start, start + weekCount);
  });
  const load = $derived(new Map(teams.map((team) => [team.id, teamLoad(ws, team, weeks)])));
  /** People only in the area get their own row, so the tile counts them too (#334). */
  const areaOnly = $derived(
    areaOnlyPeople(ws, area).length > 0 ? areaOnlyLoad(ws, area, weeks) : [],
  );
  const meetings = $derived(areaMeetingHours(ws, area));

  // ---------- key figures ----------

  const inStep = $derived(comparison.rows.filter((r) => r.inStep));
  const offTeams = $derived(
    comparison.rows.filter((r) => !r.inStep).map((r) => teamName(r.teamId)),
  );
  const cells = $derived([...load.values(), areaOnly].flat());
  const warnedMondays = $derived(
    mondays.filter((m) => cells.some((c) => c.monday === m && c.warn)),
  );
  const areaHours = $derived(meetings.reduce((sum, m) => sum + m.perWeek, 0));
  /** Everyone in the recurring area meetings; a role nobody holds counts once (#360). */
  const areaPeople = $derived(
    new Set(
      meetings
        .filter((m) => m.perWeek > 0)
        .flatMap((m) => [...m.attendees.flat(), ...m.unfilled.map((r) => `role:${r}`)]),
    ).size,
  );
  const personIds = $derived(
    new Set([
      ...area.members.map((m) => m.personId),
      ...teams.flatMap((x) => x.members.map((m) => m.personId)),
    ]),
  );
  const people = $derived(personIds.size);
  /**
   * Who is over the limit, judged like the people table in Meeting load: their average over the
   * planning horizon, all their meetings ÷ all their weekly hours (#334, #448). An average of
   * everyone must not hide anyone over the limit.
   */
  const overPeople = $derived(peopleOverLimit(ws, allWeeks, personIds));
  /**
   * The tag over the limit in pieces, so each name can open Meeting load (#462): the text around
   * the names, and the first three names with what goes between them, as `firstThree` writes it.
   */
  const overTag = $derived.by(() => {
    const mark = '\u0000';
    const [before, after = ''] = $t(
      overPeople.length === 1 ? 'overview.kpi.load.over.one' : 'overview.kpi.load.over.other',
      { n: formatNumber($locale, overPeople.length, 0), max: percent(maxFte), names: mark },
    ).split(mark);
    const shown = overPeople.slice(0, 3);
    const names: { id?: string; text: string }[] =
      overPeople.length > 3
        ? [
            ...shown.flatMap((id, i) => [
              ...(i > 0 ? [{ text: ', ' }] : []),
              { id, text: personName(id) },
            ]),
            { text: ' …' },
          ]
        : new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' })
            .formatToParts(shown)
            .map((p) =>
              p.type === 'element' ? { id: p.value, text: personName(p.value) } : { text: p.value },
            );
    return { before, after, names };
  });

  /**
   * The area's overlaps in the window, by meeting pair (#445): the clashes of its people that
   * touch the area or its teams, with the calendar's overlap rule (#339).
   */
  // The summary shows no overlaps: no clash search over every person (#450).
  const overlaps = $derived(
    summary
      ? []
      : overlapPairs(
          clashes(ws, $index, personIds, {
            from,
            to: addDays(from, weekCount * 7),
            units: new Set([area.id, ...area.teamIds]),
          }),
        ),
  );

  // ---------- time and cost per team (M3) ----------

  const rate = $derived(ws.settings.hourlyRate);
  // The summary lists each area's own meetings in a row, so no team gets an area share note.
  const costs = $derived(areaCosts(ws, $index, area, rate, !summary));
  const allMeetings = $derived(rate ? meetingCosts(ws, $index, area, rate) : []);
  /** Over the limit, or meeting hours without weekly hours to measure them against. */
  const over = (r: { share: number; noHours: boolean }) => r.noHours || r.share > maxFte;
  const shareText = (r: { share: number; noHours: boolean }) =>
    r.noHours ? $t('overview.cost.noHours') : percent(r.share);
  let period = $state(rememberedPeriod);
  const costly = $derived(costliest(allMeetings, period));
  const euro = (n: number) => formatEuro($locale, n);
  const costOf = (c: { perWeek: number; horizon: number }) =>
    period === 'week' ? c.perWeek : c.horizon;
  /** Per week, a team with a sprint or PI also gets the area share per sprint or PI (#434). */
  const areaShareKey = (a: { perCadence?: number }) =>
    period === 'week' && a.perCadence !== undefined
      ? 'overview.cost.areaShare.cadence'
      : 'overview.cost.areaShare.' + period;
  const kindOf = (id: string) => $t(`meet.kind.${unitOf(id).cadence.kind}`);
  /** Bars run from 0 to 1.5 × the limit, with a tick at the limit (one scale everywhere). */
  const barWidth = (share: number) =>
    maxFte > 0 ? Math.min(100, (share / (1.5 * maxFte)) * 100) : 0;
  const unitName = (id: string) =>
    id === area.id ? area.name : ([...ws.teams, ...ws.areas].find((x) => x.id === id)?.name ?? id);
  const areaById = (id: string) => ws.areas.find((a) => a.id === id);
  const unitOf = (id: string) =>
    id === area.id ? unit : (ws.teams.find((x) => x.id === id) ?? unit);
  /** Rule and minutes of a costly meeting; its cost includes travel, so that is named (#309). */
  function costlyWhen(event: CalEvent, unitId: string): string {
    const when = $t('overview.costly.when', {
      rule: ruleShort(event.rule, unitOf(unitId), $t, $locale),
      minutes: formatNumber($locale, event.duration, 0),
    });
    const travel = event.onSite?.travel;
    return travel ? $t('overview.costly.travel', { when, n: travel }) : when;
  }
  const cadenceShort = (c: Cadence | undefined) =>
    c
      ? $t('overview.cost.cadence', {
          kind: $t('meet.kind.' + c.kind),
          n: formatNumber($locale, c.lengthWeeks, 0),
        })
      : '–';

  // ---------- words ----------

  const maxFte = $derived(ws.settings.thresholds.maxFte);
  const list = (items: string[]) =>
    new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' }).format(items);
  /** Up to three items for a tag, "…" when there are more; the same in every tile (#448). */
  const firstThree = (items: string[]) =>
    items.length > 3 ? items.slice(0, 3).join(', ') + ' …' : list(items);
  const teamName = (id: string) => ws.teams.find((x) => x.id === id)?.name ?? id;
  const roleName = (id: string) => ws.roles.find((r) => r.id === id)?.name ?? id;
  /** "incl. 2 unfilled roles: PO, SM" for a cost row, or '' (#264). */
  const unfilledNote = (list: UnfilledRole[] | undefined) => {
    const roles = (list ?? []).filter((u) => u[period]).map((u) => u.roleId);
    return roles.length > 0
      ? $t(roles.length === 1 ? 'overview.cost.unfilled.one' : 'overview.cost.unfilled.other', {
          n: formatNumber($locale, roles.length, 0),
          roles: roles.map(roleName).join(', '),
        })
      : '';
  };
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  /** Members at 0 h raise a team's share: their meetings count, their hours do not (#446). */
  const zeroNote = (teamId: string) => {
    const team = ws.teams.find((x) => x.id === teamId);
    const ids = team ? zeroHourMembers(ws, team) : [];
    return ids.length > 0
      ? $t('overview.cost.zeroHours', { names: ids.map(personName).join(', ') })
      : '';
  };
  const percent = (n: number) => formatPercent($locale, n);
  const hours = (n: number) => formatNumber($locale, n, 1);
  const weekLabel = (monday: ISODate) =>
    $t('weeks.week', { n: formatNumber($locale, isoWeek(monday), 0) });
  const lengthText = (c: Cadence) =>
    $t(c.lengthWeeks === 1 ? 'meet.cadence.weeks.one' : 'meet.cadence.weeks.other', {
      n: formatNumber($locale, c.lengthWeeks, 0),
    });
  const cadenceText = (c: Cadence) => `${$t('meet.kind.' + c.kind)}, ${lengthText(c)}`;

  const lead = $derived(
    [
      $t(teams.length === 1 ? 'area.count.one' : 'area.count.other', {
        n: formatNumber($locale, teams.length, 0),
      }),
      $t(people === 1 ? 'overview.people.one' : 'overview.people.other', {
        n: formatNumber($locale, people, 0),
      }),
      area.cadence
        ? $t('overview.lead.cadence', {
            kind: $t('meet.kind.' + area.cadence.kind),
            weeks: lengthText(area.cadence),
            date: formatDisplayDate($locale, area.cadence.start, 'long'),
          })
        : comparison.reference?.teamId
          ? $t(peerLead(comparison.reference.changed), {
              team: teamName(comparison.reference.teamId),
            })
          : $t('overview.lead.none'),
    ].join(' · '),
  );
  /** The team's cadence changed in a what-if, or no two teams share one, or most share it. */
  function peerLead(changed = false): string {
    if (changed) return 'overview.lead.peer.saved';
    return teams.length > 1 && comparison.sharing < 2
      ? 'overview.lead.peer.first'
      : 'overview.lead.peer';
  }
  /**
   * The organisation's page names its teams and people in the tree, so only what the teams are
   * compared with: their area's cadence where it has one, else the one most teams share (#450).
   * Empty without anything to compare.
   */
  const orgLead = $derived.by(() => {
    const c = orgComparison;
    if (!c || c.rows.length < 2) return '';
    const team = c.reference?.teamId ? teamName(c.reference.teamId) : '';
    const most = c.sharing > 1;
    return [
      c.byArea > 0 ? $translate('overview.lead.org.areas') : '',
      c.others > 0 && team
        ? $translate(
            c.byArea > 0
              ? most
                ? 'overview.lead.org.others'
                : 'overview.lead.org.others.first'
              : most
                ? 'overview.lead.org'
                : 'overview.lead.org.first',
            { team },
          )
        : '',
    ]
      .filter(Boolean)
      .join(', ');
  });

  function reasonText(r: StepReason): string {
    switch (r.kind) {
      case 'weekday':
        return $t('overview.reason.weekday', { weekday: weekdayName($locale, r.weekday) });
      case 'length':
        return $t(
          comparison.reference?.fromArea
            ? 'overview.reason.length.area'
            : 'overview.reason.length.peer',
          { n: formatNumber($locale, r.weeks, 0), m: formatNumber($locale, r.reference, 0) },
        );
      case 'offset':
        return $t(r.weeks === 1 ? 'overview.reason.offset.one' : 'overview.reason.offset.other', {
          n: formatNumber($locale, r.weeks, 0),
        });
    }
  }

  function segLabel(c: Cadence, s: Segment, first = false): string {
    const label = $t('overview.seg.' + c.kind, { n: formatNumber($locale, s.number, 0) });
    if (!s.off || !comparison.reference) return label;
    // The bar says why: the other start day on the first one, the end week on one that runs over.
    const ref = comparison.reference.cadence;
    if (first && weekday(s.start) !== weekday(ref.start))
      return `${label} · ${weekdayShort($locale, weekday(s.start))}`;
    if (comparison.reference.fromArea && weekday(s.start) === weekday(ref.start))
      return `${label} · ${$t('overview.seg.ends', {
        week: weekLabel(mondayOf(addDays(s.start, c.lengthWeeks * 7 - 1))),
      })}`;
    return label;
  }
  function segDates(c: Cadence, s: Segment): string {
    return $t('overview.seg.dates', {
      from: formatDisplayDate($locale, s.start, 'short'),
      to: formatDisplayDate($locale, addDays(s.start, c.lengthWeeks * 7 - 1), 'short'),
    });
  }
  function segTitle(c: Cadence, s: Segment): string {
    const end = addDays(s.start, c.lengthWeeks * 7 - 1);
    return $t('overview.seg.title', {
      kind: $t('meet.kind.' + c.kind),
      n: formatNumber($locale, s.number, 0),
      from: formatDisplayDate($locale, s.start, 'short'),
      to: formatDisplayDate($locale, end, 'short'),
    });
  }

  /** Mondays on which an area period starts (week labels are emphasised there). */
  const areaStarts = $derived(
    new Set(comparison.areaSegments.filter((s) => s.start >= from).map((s) => mondays[s.fromWeek])),
  );

  /** Heat level 0-4 relative to the maximum share, so the ramp reads the same in every file. */
  function level(cell: LoadCell): number {
    if (cell.share <= 0) return 0;
    const r = maxFte > 0 ? cell.share / maxFte : 1;
    return r < 0.33 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4;
  }
  function cellLabel(teamId: string, cell: LoadCell): string {
    return $t(cell.warn ? 'overview.cell.warn' : 'overview.cell', {
      team: teamId === area.id ? $t('area.group.areaOnly') : teamName(teamId),
      week: weekLabel(cell.monday),
      share: percent(cell.share),
      max: percent(maxFte),
    });
  }

  // ---------- steering ----------

  /** Area members, one entry per person with all their area roles. */
  const steering = $derived.by(() => {
    const ids = [...new Set(area.members.map((m) => m.personId))];
    const list = ids.map((personId) => ({
      personId,
      roleIds: [
        ...new Set(area.members.filter((m) => m.personId === personId).map((m) => m.roleId)),
      ],
      areaHours: hoursInArea(ws, area.id, personId),
      teams: teams
        .filter((x) => x.members.some((m) => m.personId === personId))
        .map((x) => ({ id: x.id, hours: capacity(ws, personId, x.id) })),
    }));
    // Only in the area first, then those who also work in its teams.
    return [...list.filter((s) => s.teams.length === 0), ...list.filter((s) => s.teams.length > 0)];
  });
  const teamHours = (list: { id: string; hours: number }[]) =>
    list
      .map(
        (x) => ', ' + $t('overview.steer.inTeam', { hours: hours(x.hours), team: teamName(x.id) }),
      )
      .join('');
  const unit = $derived(areaAsTeam(area));
  const whenText = (e: Area['events'][number]) =>
    $t('overview.steer.when', {
      rule: ruleShort(e.rule, unit, $t, $locale),
      time: e.time,
      minutes: formatNumber($locale, e.duration, 0),
    });
</script>

{#snippet ownIcon()}{#if org}<OrgIcon />{:else}<AreaIcon />{/if}{/snippet}

{#snippet whatIfButton(unitId: string, name: string)}
  {#if $presenting}
    <button
      type="button"
      class="whatif"
      data-whatif-unit={unitId}
      data-no-print
      title={$t('whatif.open')}
      aria-label={$t('whatif.open.named', { name })}
      onclick={(e) => (whatIf = { unitId, opener: e.currentTarget })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg
      >
    </button>
  {/if}
{/snippet}

<div class="overview stack" data-area-overview>
  {#if !summary}
    <p class="lead">{lead}</p>
  {:else if orgLead}
    <p class="lead">{orgLead}</p>
  {/if}

  <section class="kpis" class:three={summary} aria-label={$t('overview.kpis')}>
    <div class="card kpi" data-kpi="cadence">
      <span class="label">{$t('overview.kpi.cadence')}</span>
      <b
        >{$t('overview.kpi.cadence.value', {
          n: formatNumber($locale, inStep.length, 0),
          total: formatNumber($locale, comparison.rows.length, 0),
        })}</b
      >
      <span class="label">{$t('overview.kpi.cadence.sub')}</span>
      {#if comparison.rows.length > 0}
        <span class="tag" class:warn={offTeams.length > 0} class:ok={offTeams.length === 0}
          >{offTeams.length > 0
            ? $t('overview.kpi.cadence.off', { list: list(offTeams) })
            : $t('overview.kpi.cadence.all')}</span
        >
      {/if}
    </div>
    <div class="card kpi" data-kpi="load">
      <span class="label">{$t('overview.kpi.load')}</span>
      <b>{shareText(costs.total)}</b>
      <span class="label">{$t('overview.kpi.load.sub')}</span>
      {#if overPeople.length > 0}
        <span class="tag warn" data-over-people
          >{overTag.before}{#each overTag.names as part, i (i)}{#if part.id && onOpenPerson}{@const id =
                part.id}<button
                type="button"
                class="person"
                aria-label={$t('overview.kpi.load.over.open', { name: part.text })}
                onclick={() => onOpenPerson(id)}>{part.text}</button
              >{:else}{part.text}{/if}{/each}{overTag.after}</span
        >
      {:else}
        <span class="tag" class:ok={!over(costs.total)} class:warn={over(costs.total)}
          >{$t(over(costs.total) ? 'overview.kpi.load.high' : 'overview.kpi.load.ok', {
            max: percent(maxFte),
          })}</span
        >
      {/if}
    </div>
    {#if !summary}
      <div class="card kpi" data-kpi="warn">
        <span class="label">{$t('overview.kpi.warn', { max: percent(maxFte) })}</span>
        <b>{formatNumber($locale, warnedMondays.length, 0)}</b>
        <span class="label"
          >{$t('overview.kpi.warn.sub', { period: nextWeeks($t, $locale, weekCount) })}</span
        >
        <span
          class="tag"
          class:warn={warnedMondays.length > 0}
          class:ok={warnedMondays.length === 0}
          >{warnedMondays.length > 0
            ? firstThree(warnedMondays.map(weekLabel))
            : $t('overview.kpi.warn.none')}</span
        >
      </div>
    {/if}
    {#if rate && costs.total.cost}
      <div class="card kpi" data-kpi="cost">
        <span class="label">{$t('overview.kpi.cost')}</span>
        <b>{euro(costs.total.cost.perWeek)}</b>
        <span class="label">{$t('overview.kpi.cost.week')}</span>
        <span class="label"
          >{$t('overview.kpi.cost.horizon', { amount: euro(costs.total.cost.horizon) })}</span
        >
        {#if costs.total.invited > 0}
          <span class="label"
            >{$t('overview.kpi.cost.person', {
              amount: euro(costs.total.cost.perWeek / costs.total.invited),
            })}</span
          >
        {/if}
        <span class="tag neutral">{$t('overview.kpi.cost.rate', { rate: euro(rate) })}</span>
      </div>
    {:else if summary}
      <div class="card kpi" data-kpi="time">
        <span class="label">{$t('overview.kpi.time')}</span>
        <b>{$t('overview.kpi.area.value', { hours: hours(costs.total.hours) })}</b>
        <span class="label">{$t('overview.kpi.cost.week')}</span>
      </div>
    {:else}
      <div class="card kpi" data-kpi="area">
        <span class="label">{$t('overview.kpi.area')}</span>
        <b>{$t('overview.kpi.area.value', { hours: hours(areaHours) })}</b>
        <span class="label"
          >{$t(areaPeople === 1 ? 'overview.kpi.area.sub.one' : 'overview.kpi.area.sub.other', {
            n: formatNumber($locale, areaPeople, 0),
          })}</span
        >
        <span class="tag area">{$t('area.kpi.areaTime')}</span>
      </div>
    {/if}
  </section>

  {#if summary}
    {@render children?.()}
  {:else if teams.length > 0}
    <OverlapList
      pairs={overlaps}
      weeks={weekCount}
      limit={3}
      onOpen={onOpenCalendar}
      onMore={onOpenOverlaps && (() => onOpenOverlaps(area.id))}
    />
  {/if}

  <section class="card" aria-labelledby="{uid}-cost" data-area-costs>
    <div class="head">
      <div>
        <h3 id="{uid}-cost" tabindex="-1">
          {$t(rate ? 'overview.cost.title' : 'overview.cost.title.time')}
        </h3>
        <!-- One line on the first screen; the counting rules unfold (#277). -->
        <details class="how">
          <summary>{$t('overview.how')}</summary>
          <p class="note">
            {$t('overview.cost.hint')}{#if rate}<span class="person-hint"
                >{' ' + $t('overview.cost.hint.person')}</span
              >{#if !summary}{' ' + $t('overview.cost.hint.areaShare')}{/if}{/if}
          </p>
          <p class="note scale">{$t('overview.cost.scale', { max: percent(maxFte) })}</p>
        </details>
      </div>
      {#if rate}
        <div class="period" data-no-print role="group" aria-label={$t('overview.cost.period')}>
          {#each ['week', 'horizon'] as const as p (p)}
            <button
              type="button"
              aria-pressed={period === p}
              onclick={() => (rememberedPeriod = period = p)}
              >{$t('overview.cost.period.' + p)}</button
            >
          {/each}
        </div>
      {/if}
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
    <div
      class="table-scroll"
      role="region"
      aria-label={$t('overview.table.region', {
        title: $t(rate ? 'overview.cost.title' : 'overview.cost.title.time'),
      })}
      tabindex="0"
    >
      <table class="costs" aria-labelledby="{uid}-cost">
        <thead>
          <tr>
            <th scope="col">{$t('overview.cost.col.unit')}</th>
            <th scope="col" class="extra">{$t('overview.cost.col.cadence')}</th>
            <th scope="col" class="num">{$t('overview.cost.col.hours')}</th>
            <th scope="col">{$t('overview.cost.col.share')}</th>
            {#if rate}
              <th scope="col" class="num">{$t('overview.cost.col.cost.' + period)}</th>
              <th scope="col" class="num extra">{$t('overview.cost.col.person')}</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each costs.teams as r (r.unitId)}
            {@const zero = zeroNote(r.unitId)}
            <tr data-cost-row={r.unitId}>
              <th scope="row">
                {#if onOpenUnit}
                  <button
                    type="button"
                    class="link"
                    aria-label={$t('overview.cost.open', {
                      name: unitName(r.unitId),
                      view: $t('view.meetings'),
                    })}
                    onclick={() => onOpenUnit(r.unitId)}>{unitName(r.unitId)}</button
                  >
                {:else}{unitName(r.unitId)}{/if}
                {#if rate && unfilledNote(r.cost?.unfilled)}
                  <small data-unfilled>{unfilledNote(r.cost?.unfilled)}</small>
                {/if}
              </th>
              <td class="extra">{cadenceShort(unitOf(r.unitId).cadence)}</td>
              <td class="num">{$t('overview.kpi.area.value', { hours: hours(r.hours) })}</td>
              <td>
                <span class="share">
                  <span class="bar" aria-hidden="true"
                    ><i style:width="{r.noHours ? 100 : barWidth(r.share)}%" class:over={over(r)}
                    ></i><b></b></span
                  >
                  <span class="num" class:over={over(r)}>{shareText(r)}</span>
                  <span class="cap muted" aria-hidden="true">{$t('overview.cost.col.share')}</span>
                </span>
                {#if zero}
                  <small data-zero-hours>{zero}</small>
                {/if}
              </td>
              {#if rate && r.cost}
                <td class="num strong cost"
                  >{euro(costOf(r.cost))}{#if r.areaShare}<span class="sr-only">, </span><small
                      data-area-share
                      >{$t(areaShareKey(r.areaShare), {
                        amount: euro(costOf(r.areaShare)),
                        cadence: euro(r.areaShare.perCadence ?? 0),
                        kind: kindOf(r.unitId),
                      })}</small
                    >{/if}</td
                >
                <td class="num muted extra"
                  >{r.invited > 0 ? euro(costOf(r.cost) / r.invited) : '–'}</td
                >
              {/if}
            </tr>
          {/each}
          {#each costs.areas as r (r.unitId)}
            {@const a = areaById(r.unitId)}
            <tr class="area-row" data-cost-row={r.unitId}>
              <th scope="row">
                {#if onOpenUnit}
                  <button
                    type="button"
                    class="link area-name"
                    aria-label={$t('overview.cost.open', {
                      name: unitName(r.unitId),
                      view: $t('view.meetings'),
                    })}
                    onclick={() => onOpenUnit(r.unitId)}><AreaIcon /> {unitName(r.unitId)}</button
                  >
                {:else}
                  <span class="area-name"><AreaIcon /> {unitName(r.unitId)}</span>
                {/if}
                {#if a && a.events.length > 0}
                  <small>{a.events.map((e) => e.name).join(', ')}</small>
                {/if}
                {#if rate && unfilledNote(r.cost?.unfilled)}
                  <small data-unfilled>{unfilledNote(r.cost?.unfilled)}</small>
                {/if}
              </th>
              <td class="extra">{cadenceShort(a?.cadence)}</td>
              <td class="num">{$t('overview.kpi.area.value', { hours: hours(r.hours) })}</td>
              <td></td>
              {#if rate && r.cost}
                <td class="num strong cost">{euro(costOf(r.cost))}</td>
                <td class="num muted extra"
                  >{r.invited > 0 ? euro(costOf(r.cost) / r.invited) : '–'}</td
                >
              {/if}
            </tr>
          {/each}
          {#if !summary || area.events.length > 0}
            <tr class="area-row" data-cost-row={area.id}>
              <th scope="row">
                {#if onOpenUnit}
                  <button
                    type="button"
                    class="link area-name"
                    class:org
                    aria-label={$t('overview.cost.open', {
                      name: $t('overview.cost.areaRow'),
                      view: $t('view.meetings'),
                    })}
                    onclick={() => onOpenUnit(area.id)}
                    >{@render ownIcon()} {$t('overview.cost.areaRow')}</button
                  >
                {:else}
                  <span class="area-name" class:org
                    >{@render ownIcon()} {$t('overview.cost.areaRow')}</span
                  >
                {/if}
                {#if area.events.length > 0}
                  <small>{area.events.map((e) => e.name).join(', ')}</small>
                {/if}
                {#if rate && unfilledNote(costs.area.cost?.unfilled)}
                  <small data-unfilled>{unfilledNote(costs.area.cost?.unfilled)}</small>
                {/if}
              </th>
              <td class="extra">{cadenceShort(area.cadence)}</td>
              <td class="num"
                >{$t('overview.kpi.area.value', { hours: hours(costs.area.hours) })}</td
              >
              <td></td>
              {#if rate && costs.area.cost}
                <td class="num strong cost">{euro(costOf(costs.area.cost))}</td>
                <td class="num muted extra"
                  >{costs.area.invited > 0
                    ? euro(costOf(costs.area.cost) / costs.area.invited)
                    : '–'}</td
                >
              {/if}
            </tr>
          {/if}
        </tbody>
        <tfoot>
          <tr data-cost-total>
            <th scope="row">{$t('overview.cost.total')}</th>
            <td class="extra"></td>
            <td class="num">{$t('overview.kpi.area.value', { hours: hours(costs.total.hours) })}</td
            >
            <td
              ><b>{shareText(costs.total)}</b>
              <span class="muted">{$t('overview.kpi.load')}</span></td
            >
            {#if rate && costs.total.cost}
              <td class="num cost">{euro(costOf(costs.total.cost))}</td>
              <td class="num extra"
                >{costs.total.invited > 0
                  ? euro(costOf(costs.total.cost) / costs.total.invited)
                  : '–'}</td
              >
            {/if}
          </tr>
        </tfoot>
      </table>
    </div>
  </section>

  {#if rate}
    {#if costly.length > 0 && !summary}
      <section class="card" aria-labelledby="{uid}-costly" data-costly>
        <div class="head">
          <div>
            <h3 id="{uid}-costly">{$t('overview.costly.title')}</h3>
            <details class="how">
              <summary>{$t('overview.how')}</summary>
              <p class="note">{$t('overview.costly.hint')}</p>
            </details>
          </div>
          <span class="muted">{$t('overview.costly.period.' + period)}</span>
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
        <div
          class="table-scroll"
          role="region"
          aria-label={$t('overview.table.region', { title: $t('overview.costly.title') })}
          tabindex="0"
        >
          <table class="costs" aria-labelledby="{uid}-costly">
            <thead>
              <tr>
                <th scope="col">{$t('overview.steer.col.meeting')}</th>
                <th scope="col">{$t('overview.costly.col.where')}</th>
                <th scope="col">{$t('overview.costly.col.when')}</th>
                <th scope="col" class="num">{$t('overview.costly.col.invited')}</th>
                <th scope="col" class="num">{$t('overview.cost.col.cost.' + period)}</th>
                <th scope="col" class="num">{$t('overview.costly.col.share')}</th>
              </tr>
            </thead>
            <tbody>
              {#each costly as m (m.unitId + '/' + m.event.id)}
                <tr data-costly-row={m.event.id}>
                  <th scope="row">
                    {#if onOpenMeeting}
                      <button
                        type="button"
                        class="link"
                        aria-label={$t('overview.steer.open', {
                          name: m.event.name,
                          view: $t('view.meetings'),
                        })}
                        onclick={() => onOpenMeeting(m.unitId, m.event.id)}>{m.event.name}</button
                      >
                    {:else}{m.event.name}{/if}
                  </th>
                  <td class="where">
                    {#if m.unitId === area.id}<span class="area-name"><AreaIcon /> {area.name}</span
                      >{:else}{unitName(m.unitId)}{/if}
                  </td>
                  <td class="muted when">{costlyWhen(m.event, m.unitId)}</td>
                  <td class="num invited"
                    >{$t('overview.costly.people', {
                      n: formatNumber($locale, m.invited, 0),
                    })}{#if m.unfilled.length > 0}<small class="unfilled"
                        >{$t('overview.costly.unfilled', {
                          roles: m.unfilled.map(roleName).join(', '),
                        })}</small
                      >{/if}</td
                  >
                  <td class="num strong cost">{euro(m.cost)}</td>
                  <td class="num share-all"
                    >{percent(m.shareOfAll)}
                    <span class="cap muted" aria-hidden="true"
                      >{$t('overview.costly.col.share')}</span
                    ></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {:else}
    <RateInvite focusAfter="[data-area-costs] h3" />
  {/if}

  <!-- Without teams there is nothing to compare; the choice of teams is offered above. -->
  {#if teams.length > 0 && !summary}
    <section class="card" aria-labelledby="{uid}-strip">
      <h3 id="{uid}-strip">{$t('overview.strip.title')}</h3>
      <p class="note">{$t('overview.strip.hint', { n: formatNumber($locale, weekCount, 0) })}</p>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
      <div
        class="scroll"
        role="region"
        aria-label={$t('overview.strip.region')}
        tabindex="0"
        style:--weeks={weekCount}
      >
        <p class="part">{$t('overview.strip.cadence')}</p>
        <div class="grid" data-cadence>
          <span></span>
          {#each mondays as m (m)}
            <span class="wk" class:start={areaStarts.has(m)}>{weekLabel(m)}</span>
          {/each}
          <span></span>

          {#if area.cadence}
            <div class="name">
              <span class="who area-name"
                ><AreaIcon /><span class="n">{area.name}</span>{@render whatIfButton(
                  area.id,
                  area.name,
                )}</span
              >
              <small>{cadenceText(area.cadence)}</small>
            </div>
            <div class="row">
              {#each comparison.areaSegments as s (s.number)}
                <span
                  class="seg area"
                  style:grid-column="{s.fromWeek + 1} / span {s.span}"
                  title={segTitle(area.cadence, s)}
                  >{segLabel(area.cadence, s)}<span class="sr-only"
                    >, {segDates(area.cadence, s)}</span
                  ></span
                >
              {/each}
            </div>
            <span></span>
          {/if}

          {#each comparison.rows as row (row.teamId)}
            <div class="name" data-team-row={row.teamId}>
              <span class="who"
                ><span class="n">{teamName(row.teamId)}</span>{@render whatIfButton(
                  row.teamId,
                  teamName(row.teamId),
                )}</span
              >
              <small>{cadenceText(row.cadence)}</small>
              <small class:off={!row.inStep} class:in={row.inStep}
                >{row.inStep
                  ? $t('overview.inStep')
                  : row.reasons.map(reasonText).join(', ')}</small
              >
            </div>
            <div class="row">
              {#each row.segments as s, i (s.number)}
                <span
                  class="seg"
                  class:off={s.off}
                  style:grid-column="{s.fromWeek + 1} / span {s.span}"
                  title={segTitle(row.cadence, s)}
                  >{segLabel(row.cadence, s, i === 0)}<span class="sr-only"
                    >, {segDates(row.cadence, s)}{s.off ? `, ${$t('overview.seg.off')}` : ''}</span
                  ></span
                >
              {/each}
            </div>
            <span></span>
          {/each}
        </div>

        <p class="part">
          {$t('overview.strip.load')}
        </p>
        <table class="grid heat" data-load>
          <thead>
            <tr>
              <td></td>
              {#each mondays as m (m)}
                <th scope="col" class="wk">{weekLabel(m)}</th>
              {/each}
              <th scope="col" class="wk avg"
                ><abbr title={$t('overview.avg.label')}>{$t('overview.avg')}</abbr></th
              >
            </tr>
          </thead>
          <tbody>
            {#snippet heatRow(unitId: string, name: string, row: LoadCell[], start?: ISODate)}
              <tr data-team={unitId}>
                <th scope="row" class="name">{name}</th>
                {#each row as cell (cell.monday)}
                  <td>
                    <button
                      type="button"
                      class="cell l{level(cell)}"
                      class:warn={cell.warn}
                      data-week={cell.monday}
                      aria-label={cellLabel(unitId, cell)}
                      onclick={() => onOpenLoad?.(unitId, cell.monday)}
                      >{formatNumber($locale, Math.round(cell.share * 100), 0)}</button
                    >
                  </td>
                {/each}
                <td class="avg">{percent(loadAverage(row, ws.settings.horizon, start))}</td>
              </tr>
            {/snippet}
            {#each teams as team (team.id)}
              {@render heatRow(team.id, team.name, load.get(team.id) ?? [], team.cadence.start)}
            {/each}
            {#if areaOnly.length > 0}
              {@render heatRow(area.id, $t('area.group.areaOnly'), areaOnly, area.cadence?.start)}
            {/if}
          </tbody>
        </table>
      </div>

      <ul class="legend">
        <li><i class="key fits" aria-hidden="true"></i>{$t('overview.legend.fits')}</li>
        <li><i class="key off" aria-hidden="true"></i>{$t('overview.legend.off')}</li>
        {#if area.cadence}
          <li><i class="key area" aria-hidden="true"></i>{$t('overview.legend.area')}</li>
        {/if}
        <li>
          <i class="key swatch l1" aria-hidden="true"></i><i
            class="key swatch l2"
            aria-hidden="true"
          ></i><i class="key swatch l4" aria-hidden="true"></i>{$t('overview.legend.load')}
        </li>
        <li data-legend-avg>
          {$t('overview.legend.avg', {
            avg: $t('overview.avg'),
            share: $t('overview.cost.col.share'),
          })}
        </li>
        <li>
          <i class="key swatch warn" aria-hidden="true"></i>{$t('overview.legend.warn', {
            max: percent(maxFte),
          })}
        </li>
      </ul>
    </section>
  {/if}

  {#if !summary}
    <section class="card" aria-labelledby="{uid}-steer">
      <h3 id="{uid}-steer">{$t('overview.steer.title')}</h3>
      <p class="note">{$t('overview.steer.hint')}</p>
      <div class="steer">
        <div>
          <h4 class="part" id="{uid}-roles">{$t('overview.steer.roles')}</h4>
          {#if steering.length === 0}
            <p class="empty">{$t('overview.steer.noRoles')}</p>
          {:else}
            <ul class="people" aria-labelledby="{uid}-roles" data-area-roles>
              {#each steering as s (s.personId)}
                <li>
                  <span class="avatar" aria-hidden="true">{initials(personName(s.personId))}</span>
                  <div>
                    <span class="person">{personName(s.personId)}</span>
                    <small>
                      {s.roleIds.map(roleName).join(', ')} ·
                      {#if s.areaHours > 0}{$t('overview.steer.areaHours', {
                          hours: hours(s.areaHours),
                        })}{:else}<span class="unset"
                          >{#if $presenting}{$t('area.hours.none')}{:else}<span data-no-print
                              >{$t('area.hours.unset')}</span
                            ><span data-print-only>{$t('area.hours.none')}</span>{/if}</span
                        >{/if}{teamHours(s.teams)}
                    </small>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h4 class="part" id="{uid}-meetings">{$t('overview.steer.meetings')}</h4>
          {#if area.events.length === 0}
            <p class="empty">{$t('overview.steer.noMeetings')}</p>
          {:else}
            <table class="meetings" aria-labelledby="{uid}-meetings" data-area-meetings>
              <thead>
                <tr>
                  <th scope="col">{$t('overview.steer.col.meeting')}</th>
                  <th scope="col">{$t('overview.steer.col.who')}</th>
                  <th scope="col" class="num"
                    ><abbr title={$t('overview.steer.col.hours.long')}
                      >{$t('overview.steer.col.hours')}</abbr
                    ></th
                  >
                </tr>
              </thead>
              <tbody>
                {#each area.events as event, i (event.id)}
                  {@const m = meetings[i]}
                  <tr data-meeting={event.id}>
                    <td class="what">
                      {#if onOpenMeeting}
                        <button
                          type="button"
                          class="title link"
                          aria-label={$t('overview.steer.open', {
                            name: event.name,
                            view: $t('view.meetings'),
                          })}
                          onclick={() => onOpenMeeting(area.id, event.id)}>{event.name}</button
                        >
                      {:else}
                        <span class="title">{event.name}</span>
                      {/if}
                      <small>{whenText(event)}</small>
                    </td>
                    <td class="who">
                      <AreaMeetingWho {area} {event} />
                    </td>
                    <td class="num">
                      {#if m && m.recurring}
                        {hours(m.perWeek)}
                      {:else}
                        <span aria-hidden="true">–</span><span class="sr-only"
                          >{$t('overview.steer.irregular')}</span
                        >
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

{#if whatIf}
  <WhatIfSheet
    target={{ kind: 'cadence', unitId: whatIf.unitId }}
    onclose={() => {
      whatIf?.opener.focus();
      whatIf = undefined;
    }}
  />
{/if}

<style>
  .overview {
    --h0: var(--surface-2);
    --h1: light-dark(#dcd8ff, #2c2760);
    --h2: light-dark(#b3a9ff, #463d9a);
    --h3: light-dark(#6a58ea, #8a7cf0);
    --h4: light-dark(#4a37d6, #a99dff);
    --label: 9.5rem;
    min-width: 0;
  }
  .lead {
    margin: 0;
    color: var(--text-muted);
  }
  .note {
    margin: 0.15rem 0 0.75rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  /* ---------- key figures ---------- */
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .kpis.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  :global(#app) .overview .kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    padding: 1rem 1.15rem;
  }
  .kpi b {
    font-size: 1.6rem;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .kpi .label {
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .tag {
    margin-top: 0.4rem;
    padding: 0.05rem 0.55rem;
    border-radius: 99px;
    font-size: 0.8rem;
  }
  /* A name over the limit opens Meeting load at that person (#462). */
  :global(#app) .tag .person {
    min-height: 0;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    font-weight: 650;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  .tag.ok {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .tag.warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .tag.area {
    background: var(--area-soft);
    color: var(--area);
  }

  .tag.neutral {
    background: var(--surface-2);
    color: var(--text-muted);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  /* ---------- time and cost per team ---------- */
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .head h3 {
    margin: 0;
  }
  .head > div:first-child {
    flex: 1 1 28rem;
    max-width: 52rem;
  }
  .period {
    display: inline-flex;
    padding: 0.2rem;
    border-radius: 999px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
  }
  :global(#app) .period button {
    min-height: 2.25rem;
    padding: 0.25rem 0.85rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    box-shadow: none;
    color: var(--text-muted);
    font-weight: 600;
  }
  /* Phones: the toggle takes the card's width, so the horizon label keeps to one line. */
  @media (max-width: 40rem) {
    .period {
      display: flex;
      width: 100%;
    }
    :global(#app) .period button {
      flex: 1;
    }
  }
  :global(#app) .period button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  @media (forced-colors: active) {
    :global(#app) .period button[aria-pressed='true'] {
      border: 2px solid Highlight;
    }
  }
  .table-scroll {
    overflow-x: auto;
  }
  .table-scroll:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  table.costs {
    width: 100%;
    min-width: 40rem;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  :global(#app) table.costs thead th {
    text-align: left;
    white-space: nowrap;
  }
  :global(#app) table.costs thead th.num,
  :global(#app) table.costs td.num {
    text-align: right;
  }
  /* Number headings may wrap: the cost one names the planning horizon (#278). */
  :global(#app) table.costs thead th.num {
    white-space: normal;
  }
  :global(#app) table.costs td {
    white-space: nowrap;
  }
  :global(#app) table.costs th[scope='row'] {
    text-align: left;
    font-weight: 600;
  }
  :global(#app) table.costs th[scope='row'] small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 400;
  }
  :global(#app) table.costs tfoot th,
  :global(#app) table.costs tfoot td {
    border-top: 2px solid var(--border);
    font-weight: 700;
  }
  .strong {
    font-weight: 650;
  }
  /* A team's people in the area's meetings: informative, not part of the total (#336). */
  [data-area-share] {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 400;
  }
  .unfilled {
    display: block;
    color: var(--warn);
    font-size: 0.75rem;
  }
  .share-all .cap {
    display: none;
  }
  .muted {
    color: var(--text-muted);
    font-weight: 400;
  }
  .share {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }
  .share .num {
    min-width: 3rem;
  }
  .share .cap {
    display: none;
  }
  [data-zero-hours] {
    display: block;
    color: var(--warn);
    font-size: 0.75rem;
    font-weight: 400;
    white-space: normal;
  }
  .share .num.over {
    color: var(--warn);
    font-weight: 700;
  }
  .bar {
    position: relative;
    display: block;
    width: 6.5rem;
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
  /* The limit sits at two thirds of the scale (0 to 1.5 × the limit). */
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
  .how summary {
    width: fit-content;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--accent-text);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .how summary::before {
    content: '';
    width: 0.4em;
    height: 0.4em;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: rotate(-45deg);
  }
  .how[open] summary::before {
    transform: rotate(45deg);
  }
  /* Paper has no disclosure: the explanation prints, open or closed. */
  @media print {
    .how summary {
      display: none;
    }
    .how::details-content {
      content-visibility: visible;
      display: block;
    }
    .how > :global(:not(summary)) {
      display: block;
    }
  }
  .how .note {
    max-width: 48rem;
    margin: 0 0 0.5rem;
  }

  /* ---------- cadence strip and heat map on one axis ---------- */
  .scroll {
    /* Holds the hidden segment texts (absolute), so they do not widen the page (#281). */
    position: relative;
    overflow-x: auto;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .part {
    margin: 1rem 0 0.5rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .scroll > .part:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  div.grid {
    display: grid;
    grid-template-columns: var(--label) repeat(var(--weeks), minmax(2.6rem, 1fr)) 3.25rem;
    align-items: center;
    row-gap: 0.5rem;
    min-width: 44rem;
  }
  .row {
    display: grid;
    grid-column: 2 / span var(--weeks);
    grid-template-columns: repeat(var(--weeks), minmax(0, 1fr));
  }
  .wk {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
  }
  .wk.start {
    color: var(--area);
    font-weight: 700;
  }
  .name {
    position: sticky;
    left: 0;
    z-index: 1;
    align-self: stretch;
    background: var(--surface);
    min-width: 0;
    padding-right: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
  }
  .name small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 400;
  }
  .name small.off {
    color: var(--warn);
  }
  .name small.in {
    color: var(--ok);
  }
  /* The pencil of a what-if, as on Meetings (#444); coarse pointers get 44 px from theme.css. */
  :global(#app) .name .whatif {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    flex: none;
    margin: -0.25rem 0;
    padding: 0;
    color: var(--text-muted);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  :global(#app) .name .whatif:hover {
    color: var(--accent-text);
    background: var(--accent-soft);
  }
  .whatif svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Name and pencil stay on one line; a long name wraps beside the pencil (#444). */
  .who {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }
  .who .n {
    min-width: 0;
    overflow-wrap: break-word;
    hyphens: auto;
  }
  /* On touch screens the pencil keeps its size; an invisible ::after takes the taps around it. */
  @media (pointer: coarse) {
    :global(#app) .name .whatif {
      position: relative;
      min-width: 0 !important;
      min-height: 0 !important;
    }
    :global(#app) .name .whatif::after {
      content: '';
      position: absolute;
      inset: calc((100% - 44px) / 2);
    }
  }
  .area-name {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--area);
  }
  .area-name.org {
    color: var(--org);
  }
  /* The row names keep to one line, so the column takes their width (#450). */
  [data-area-costs] th .area-name {
    white-space: nowrap;
  }
  .seg {
    display: flex;
    align-items: center;
    height: 1.65rem;
    margin-right: 3px;
    padding: 0 0.5rem;
    overflow: hidden;
    border-left: 3px solid var(--accent);
    border-radius: 0.4rem;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .seg.off {
    border-left-color: var(--warn);
    background: var(--warn-soft);
    color: var(--warn);
  }
  .seg.area {
    border: 1px dashed var(--area);
    border-left: 3px solid var(--area);
    background: var(--area-soft);
    color: var(--area);
    font-weight: 600;
  }

  :global(#app) table.heat {
    width: 100%;
    min-width: 44rem;
    border-collapse: separate;
    border-spacing: 0 3px;
    table-layout: fixed;
  }
  :global(#app) table.heat thead td,
  :global(#app) table.heat .name {
    width: var(--label);
  }
  :global(#app) table.heat .avg {
    width: 3.25rem;
  }
  :global(#app) table.heat td,
  :global(#app) table.heat th {
    padding: 0;
    border: 0;
  }
  /* No row tint on hover: the cells are the targets. */
  :global(#app) table.heat.heat tbody tr:hover > * {
    background: transparent;
  }
  :global(#app) table.heat.heat tbody tr:hover > th {
    background: var(--surface);
  }
  :global(#app) table.heat td {
    padding-right: 3px;
  }
  :global(#app) table.heat th.wk {
    font-weight: 500;
  }
  :global(#app) td.avg,
  :global(#app) th.avg {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  abbr {
    text-decoration: none;
  }
  :global(#app) .cell {
    display: grid;
    place-items: center;
    width: 100%;
    height: 1.65rem;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0.3rem;
    background: var(--h0);
    color: var(--text);
    font: inherit;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  :global(#app) .cell:hover {
    filter: brightness(0.95);
  }
  :global(#app) .cell:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  :global(#app) .cell.l1 {
    background: var(--h1);
  }
  :global(#app) .cell.l2 {
    background: var(--h2);
  }
  :global(#app) .cell.l3 {
    background: var(--h3);
    color: light-dark(#fff, #0a0c18);
  }
  :global(#app) .cell.l4 {
    background: var(--h4);
    color: light-dark(#fff, #0a0c18);
  }
  /* Drawn outside the cell, over the card: --hot reaches 3:1 there in both schemes. */
  :global(#app) .cell.warn {
    outline: 2px solid var(--hot);
    outline-offset: 0;
  }
  :global(#app) .cell.warn:focus-visible {
    outline-color: var(--focus);
    outline-offset: 2px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.85rem 0 0;
    padding: 0;
    list-style: none;
    color: var(--text-muted);
    font-size: 0.78rem;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .key {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 0.2rem;
  }
  .key.fits {
    border-left: 3px solid var(--accent);
    background: var(--accent-soft);
  }
  .key.off {
    border-left: 3px solid var(--warn);
    background: var(--warn-soft);
  }
  .key.area {
    border: 1px dashed var(--area);
    background: var(--area-soft);
  }
  .key.swatch.l1 {
    background: var(--h1);
  }
  .key.swatch.l2 {
    background: var(--h2);
  }
  .key.swatch.l4 {
    background: var(--h4);
  }
  .key.swatch.warn {
    background: var(--h0);
    outline: 2px solid var(--hot);
    outline-offset: -2px;
  }

  /* ---------- steering ---------- */
  .steer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 1.5rem;
    align-items: start;
  }
  .steer h4.part {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .empty {
    margin: 0;
    color: var(--text-muted);
  }
  .people {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .people li {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
  }
  .people .person {
    margin-right: 0.35rem;
    font-weight: 600;
  }
  .people small {
    display: block;
    margin-top: 0.15rem;
    color: var(--text-muted);
    font-size: 0.78rem;
  }
  .unset {
    color: var(--warn);
    font-weight: 600;
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    background: linear-gradient(135deg, #14b8a6, #22c3ee);
    color: #062a26;
    font-size: 0.68rem;
    font-weight: 750;
  }
  table.meetings {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  :global(#app) .meetings td {
    vertical-align: top;
  }
  :global(#app) .meetings .title {
    display: block;
    font-weight: 600;
  }
  :global(#app) button.link {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  :global(#app) .meetings small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global(#app) .meetings th {
    text-align: left;
  }
  :global(#app) .meetings th.num {
    text-align: right;
  }

  @media (max-width: 1100px) {
    .kpis,
    .kpis.three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* Three figures: the last one takes the whole row instead of half of it. */
    .kpis.three > :nth-child(3) {
      grid-column: 1 / -1;
    }
    .steer {
      grid-template-columns: 1fr;
    }
  }
  /* Phones: the meetings become cards (name and hours on top, who below). */
  @media (max-width: 640px) {
    [data-area-costs] th .area-name {
      white-space: normal;
    }
    .overview {
      --label: 6.75rem;
    }
    :global(#app) .overview .card {
      padding: 1rem;
    }
    /* The cost table becomes cards: team and cost on top, hours and share below (#281). */
    :global(#app) [data-area-costs] table.costs,
    :global(#app) [data-costly] table.costs {
      min-width: 0;
    }
    :global(#app) [data-area-costs] thead,
    :global(#app) [data-costly] thead,
    :global(#app) .meetings thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    :global(#app) [data-area-costs] tr,
    :global(#app) [data-costly] tbody tr,
    :global(#app) .meetings tr {
      display: grid;
      grid-template-columns: 1fr auto;
      margin-bottom: 0.6rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
    }
    :global(#app) [data-area-costs] table.costs :is(th, td),
    :global(#app) [data-costly] table.costs :is(th, td),
    :global(#app) .meetings td {
      padding: 0.15rem 0;
      border: 0;
    }
    :global(#app) [data-area-costs] tr {
      grid-template-columns: auto minmax(0, 1fr) auto;
      column-gap: 0.75rem;
    }
    :global(#app) [data-area-costs] td {
      white-space: normal;
    }
    :global(#app) [data-area-costs] th[scope='row'] {
      grid-column: 1 / 3;
    }
    :global(#app) [data-area-costs] .cost {
      grid-row: 1;
      grid-column: 3;
    }
    /* The area share wraps below the cost instead of squeezing the team name. */
    [data-area-share] {
      max-width: 9rem;
      margin-left: auto;
      white-space: normal;
    }
    :global(#app) [data-area-costs] .extra,
    [data-area-costs] .bar,
    [data-area-costs] .person-hint,
    [data-area-costs] .scale {
      display: none;
    }
    [data-area-costs] .cap {
      display: inline;
    }
    :global(#app) .meetings td.who {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    /* The most expensive meetings: meeting and cost on top, then where and invited,
       when, and the share (#283). */
    :global(#app) [data-costly] tbody tr {
      grid-template-columns: minmax(0, 1fr) fit-content(50%);
      column-gap: 0.75rem;
    }
    :global(#app) [data-costly] table.costs td {
      white-space: normal;
    }
    :global(#app) [data-costly] :is(.when, .share-all) {
      grid-column: 1 / -1;
    }
    :global(#app) [data-costly] .cost {
      grid-row: 1;
      grid-column: 2;
    }
    :global(#app) [data-costly] .invited {
      grid-row: 2;
      grid-column: 2;
    }
    /* The area's icon must not make its card taller than the others. */
    [data-costly] .where .area-name {
      vertical-align: top;
    }
    .share-all .cap {
      display: inline;
    }
  }
</style>
