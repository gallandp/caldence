<script lang="ts" module>
  /** Cost per week or in the planning horizon, kept while the app is open. */
  let rememberedPeriod: 'week' | 'horizon' = 'week';
</script>

<script lang="ts">
  import { areaCosts, costliest, meetingCosts } from '../../core/areaCosts';
  import type { UnfilledRole } from '../../core/cost';
  import {
    areaMeetingHours,
    compareCadences,
    teamLoad,
    type LoadCell,
    type Segment,
    type StepReason,
  } from '../../core/areaOverview';
  import { addDays, diffDays, isoWeek, mondayOf, weekday, type ISODate } from '../../core/date';
  import { areaHours as hoursInArea, capacity, loadPerWeek } from '../../core/load';
  import { areaAsTeam, type Area, type Cadence } from '../../core/model';
  import {
    formatDisplayDate,
    formatEuro,
    formatNumber,
    formatPercent,
    locale,
    translate as t,
  } from '../../i18n';
  import { initials } from '../avatar';
  import AreaIcon from '../components/AreaIcon.svelte';
  import AreaMeetingWho from '../components/AreaMeetingWho.svelte';
  import RateInvite from '../components/RateInvite.svelte';
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
    /** Opens a meeting of the area or one of its teams in Meetings & cadence. */
    onOpenMeeting?: (unitId: string, eventId: string) => void;
    /** Opens Meetings & cadence of a team or of the area. */
    onOpenUnit?: (unitId: string) => void;
  }
  let { area, onOpenLoad, onOpenMeeting, onOpenUnit }: Props = $props();

  /** Weeks on the axis. */
  const WEEKS = 12;

  const uid = $props.id();
  const ws = $derived($workspace);
  const teams = $derived(area.teamIds.flatMap((id) => ws.teams.filter((x) => x.id === id)));

  /** The window starts this week, inside the horizon, and holds up to WEEKS weeks of it. */
  const from = $derived.by(() => {
    const today = mondayOf(localToday());
    const first = mondayOf(ws.settings.horizon.from);
    const last = mondayOf(ws.settings.horizon.to);
    // Near the end of the horizon the window ends with it instead of shrinking.
    const latest = addDays(last, -(WEEKS - 1) * 7);
    const end = latest > first ? latest : first;
    return today < first ? first : today > end ? end : today;
  });
  const weekCount = $derived(
    Math.max(1, Math.min(WEEKS, diffDays(mondayOf(ws.settings.horizon.to), from) / 7 + 1)),
  );
  const mondays = $derived(Array.from({ length: weekCount }, (_, i) => addDays(from, i * 7)));

  const comparison = $derived(compareCadences(ws, area, from, weekCount));
  const weeks = $derived.by(() => {
    const all = loadPerWeek(ws, $index);
    const start = all.findIndex((w) => w.monday === from);
    return start < 0 ? [] : all.slice(start, start + weekCount);
  });
  const load = $derived(new Map(teams.map((team) => [team.id, teamLoad(ws, team, weeks)])));
  const meetings = $derived(areaMeetingHours(ws, area));

  // ---------- key figures ----------

  const inStep = $derived(comparison.rows.filter((r) => r.inStep));
  const offTeams = $derived(
    comparison.rows.filter((r) => !r.inStep).map((r) => teamName(r.teamId)),
  );
  const cells = $derived([...load.values()].flat());
  const warnedMondays = $derived(
    mondays.filter((m) => cells.some((c) => c.monday === m && c.warn)),
  );
  const areaHours = $derived(meetings.reduce((sum, m) => sum + m.perWeek, 0));
  const areaPeople = $derived(
    new Set(meetings.filter((m) => m.perWeek > 0).flatMap((m) => m.attendees.flat())).size,
  );
  const people = $derived(
    new Set([
      ...area.members.map((m) => m.personId),
      ...teams.flatMap((x) => x.members.map((m) => m.personId)),
    ]).size,
  );

  // ---------- time and cost per team (M3) ----------

  const rate = $derived(ws.settings.hourlyRate);
  const costs = $derived(areaCosts(ws, $index, area, rate));
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
  /** Bars run from 0 to 1.5 × the limit, with a tick at the limit (one scale everywhere). */
  const barWidth = (share: number) =>
    maxFte > 0 ? Math.min(100, (share / (1.5 * maxFte)) * 100) : 0;
  const unitName = (id: string) =>
    id === area.id ? area.name : (ws.teams.find((x) => x.id === id)?.name ?? id);
  const unitOf = (id: string) =>
    id === area.id ? unit : (ws.teams.find((x) => x.id === id) ?? unit);
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
          ? $t('overview.lead.peer', { team: teamName(comparison.reference.teamId) })
          : $t('overview.lead.none'),
    ].join(' · '),
  );

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
      team: teamName(teamId),
      week: weekLabel(cell.monday),
      share: percent(cell.share),
      max: percent(maxFte),
    });
  }
  const average = (cells: LoadCell[]) =>
    cells.length > 0 ? cells.reduce((sum, c) => sum + c.share, 0) / cells.length : 0;

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

<div class="overview stack" data-area-overview>
  <p class="lead">{lead}</p>

  <section class="kpis" aria-label={$t('overview.kpis')}>
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
      <span class="tag" class:ok={!over(costs.total)} class:warn={over(costs.total)}
        >{$t(over(costs.total) ? 'overview.kpi.load.high' : 'overview.kpi.load.ok', {
          max: percent(maxFte),
        })}</span
      >
    </div>
    <div class="card kpi" data-kpi="warn">
      <span class="label">{$t('overview.kpi.warn', { max: percent(maxFte) })}</span>
      <b>{formatNumber($locale, warnedMondays.length, 0)}</b>
      <span class="label"
        >{$t('overview.kpi.warn.sub', { n: formatNumber($locale, weekCount, 0) })}</span
      >
      <span class="tag" class:warn={warnedMondays.length > 0} class:ok={warnedMondays.length === 0}
        >{warnedMondays.length > 0
          ? list(warnedMondays.slice(0, 3).map(weekLabel)) + (warnedMondays.length > 3 ? ' …' : '')
          : $t('overview.kpi.warn.none')}</span
      >
    </div>
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

  <section class="card" aria-labelledby="{uid}-cost" data-area-costs>
    <div class="head">
      <div>
        <h3 id="{uid}-cost" tabindex="-1">
          {$t(rate ? 'overview.cost.title' : 'overview.cost.title.time')}
        </h3>
        <p class="note">
          {$t('overview.cost.hint')}{#if rate}<span class="person-hint"
              >{' ' + $t('overview.cost.hint.person')}</span
            >{/if}
        </p>
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
              </td>
              {#if rate && r.cost}
                <td class="num strong cost">{euro(costOf(r.cost))}</td>
                <td class="num muted extra"
                  >{r.invited > 0 ? euro(costOf(r.cost) / r.invited) : '–'}</td
                >
              {/if}
            </tr>
          {/each}
          <tr class="area-row" data-cost-row={area.id}>
            <th scope="row">
              {#if onOpenUnit}
                <button
                  type="button"
                  class="link area-name"
                  aria-label={$t('overview.cost.open', {
                    name: $t('overview.cost.areaRow'),
                    view: $t('view.meetings'),
                  })}
                  onclick={() => onOpenUnit(area.id)}
                  ><AreaIcon /> {$t('overview.cost.areaRow')}</button
                >
              {:else}
                <span class="area-name"><AreaIcon /> {$t('overview.cost.areaRow')}</span>
              {/if}
              {#if area.events.length > 0}
                <small>{area.events.map((e) => e.name).join(', ')}</small>
              {/if}
              {#if rate && unfilledNote(costs.area.cost?.unfilled)}
                <small data-unfilled>{unfilledNote(costs.area.cost?.unfilled)}</small>
              {/if}
            </th>
            <td class="extra">{cadenceShort(area.cadence)}</td>
            <td class="num">{$t('overview.kpi.area.value', { hours: hours(costs.area.hours) })}</td>
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
    <p class="note below">
      {$t('overview.cost.scale', { max: percent(maxFte) })}
    </p>
  </section>

  {#if rate}
    {#if costly.length > 0}
      <section class="card" aria-labelledby="{uid}-costly" data-costly>
        <div class="head">
          <div>
            <h3 id="{uid}-costly">{$t('overview.costly.title')}</h3>
            <p class="note">{$t('overview.costly.hint')}</p>
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
                  <td>
                    {#if m.unitId === area.id}<span class="area-name"><AreaIcon /> {area.name}</span
                      >{:else}{unitName(m.unitId)}{/if}
                  </td>
                  <td class="muted">
                    {$t('overview.costly.when', {
                      rule: ruleShort(m.event.rule, unitOf(m.unitId), $t, $locale),
                      minutes: formatNumber($locale, m.event.duration, 0),
                    })}
                  </td>
                  <td class="num"
                    >{$t('overview.costly.people', {
                      n: formatNumber($locale, m.invited, 0),
                    })}{#if m.unfilled.length > 0}<small class="unfilled"
                        >{$t('overview.costly.unfilled', {
                          roles: m.unfilled.map(roleName).join(', '),
                        })}</small
                      >{/if}</td
                  >
                  <td class="num strong">{euro(m.cost)}</td>
                  <td class="num">{percent(m.shareOfAll)}</td>
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
  {#if teams.length > 0}
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
              <span class="area-name"><AreaIcon /> {area.name}</span>
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
              <span>{teamName(row.teamId)}</span>
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
            {#each teams as team (team.id)}
              {@const row = load.get(team.id) ?? []}
              <tr data-team={team.id}>
                <th scope="row" class="name">{team.name}</th>
                {#each row as cell (cell.monday)}
                  <td>
                    <button
                      type="button"
                      class="cell l{level(cell)}"
                      class:warn={cell.warn}
                      data-week={cell.monday}
                      aria-label={cellLabel(team.id, cell)}
                      onclick={() => onOpenLoad?.(team.id, cell.monday)}
                      >{formatNumber($locale, Math.round(cell.share * 100), 0)}</button
                    >
                  </td>
                {/each}
                <td class="avg">{percent(average(row))}</td>
              </tr>
            {/each}
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
</div>

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
  .unfilled {
    display: block;
    color: var(--warn);
    font-size: 0.75rem;
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
  .note.below {
    margin: 0.75rem 0 0;
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
  .area-name {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--area);
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
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .steer {
      grid-template-columns: 1fr;
    }
  }
  /* Phones: the meetings become cards (name and hours on top, who below). */
  @media (max-width: 640px) {
    .overview {
      --label: 6.75rem;
    }
    :global(#app) .overview .card {
      padding: 1rem;
    }
    /* The cost table becomes cards: team and cost on top, hours and share below (#281). */
    :global(#app) [data-area-costs] table.costs {
      min-width: 0;
    }
    :global(#app) [data-area-costs] thead,
    :global(#app) .meetings thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    :global(#app) [data-area-costs] tr,
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
    :global(#app) [data-area-costs] .extra,
    [data-area-costs] .bar,
    [data-area-costs] .person-hint,
    [data-area-costs] .note.below {
      display: none;
    }
    [data-area-costs] .cap {
      display: inline;
    }
    :global(#app) .meetings td.who {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
