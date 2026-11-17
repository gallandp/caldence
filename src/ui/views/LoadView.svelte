<script lang="ts">
  import { costSummary } from '../../core/cost';
  import { isoWeek } from '../../core/date';
  import {
    areaHours,
    capacity,
    fte,
    hoursIn,
    loadPerWeek,
    overMax,
    warnings,
  } from '../../core/load';
  import { unitLoadIds } from '../../core/model';
  import { record } from '../../core/record';
  import { loadSummary, scopePeople, warnedWeeks, weekRows } from '../../core/views';
  import {
    formatDisplayDate,
    formatNumber,
    formatPercent,
    locale,
    translate as t,
  } from '../../i18n';
  import CostCard from '../components/CostCard.svelte';
  import RateInvite from '../components/RateInvite.svelte';
  import WeekFocus from '../components/WeekFocus.svelte';
  import { filter, index, workspace } from '../state/workspace';

  const summary = $derived(loadSummary($workspace, $filter));
  const weeks = $derived(loadPerWeek($workspace, $index));
  const hpw = $derived($workspace.settings.hoursPerWeek);

  const roleName = (id: string): string => $workspace.roles.find((r) => r.id === id)?.name ?? id;
  const categoryName = (id: string): string =>
    $workspace.categories.find((c) => c.id === id)?.name ?? id;

  const hours = (n: number): string => formatNumber($locale, n, 1);
  const weekLabel = (monday: string): string =>
    $t('weeks.week', { n: formatNumber($locale, isoWeek(monday), 0) });

  /** With a team or area filter the person table shows its members and their hours in it. */
  const teamId = $derived($filter.personId ? undefined : $filter.teamId);
  const area = $derived($workspace.areas.find((a) => a.id === teamId));
  /** The team's id, or an area's teams and the area itself (its own meetings count there). */
  const teamIds = $derived(teamId ? unitLoadIds($workspace, teamId) : undefined);
  const people = $derived(
    $filter.personId
      ? $workspace.people.filter((p) => p.id === $filter.personId)
      : teamId
        ? $workspace.people.filter((p) => scopePeople($workspace, { teamId }).has(p.id))
        : $workspace.people,
  );

  const perPerson = $derived(
    people.map((person) => {
      const of = (w: (typeof weeks)[number]): number =>
        teamIds ? hoursIn(w, teamIds, person.id) : (w.byPerson[person.id] ?? 0);
      const total = weeks.reduce((sum, w) => sum + of(w), 0);
      const average = weeks.length > 0 ? total / weeks.length : 0;
      let peak: { monday: string; hours: number } | undefined;
      for (const w of weeks) {
        const h = of(w);
        if (h > 0 && (peak === undefined || h > peak.hours)) peak = { monday: w.monday, hours: h };
      }
      const cap = capacity($workspace, person.id, teamId);
      const all = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
      const allAverage = weeks.length > 0 ? all / weeks.length : 0;
      return {
        person,
        average,
        cap,
        fte: fte(average, cap),
        /** All meetings over all weekly hours, shown next to a team's or area's share. */
        allShare: fte(allAverage, capacity($workspace, person.id)),
        /** Hours per week that still fit into meetings before the limit (none without hours). */
        free: Math.max(0, maxFte * cap - average),
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
  /** Meetings without weekly hours to measure them against come first: always over the limit. */
  const noHours = (p: { average: number; cap: number }) => p.average > 0 && p.cap <= 0;
  const shareKey = (p: { average: number; cap: number; fte: number }) =>
    noHours(p) ? Infinity : p.fte;
  const barWidth = (share: number) =>
    maxFte > 0 ? Math.min(100, (share / (1.5 * maxFte)) * 100) : 0;

  const allWarnings = $derived(warnings(weeks, $workspace, $filter));

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
    const label = (mondays: string[]): string[] => {
      // Week numbers repeat on horizons longer than a year: then the Mondays are named instead.
      const labels = mondays.map(weekLabel);
      return new Set(labels).size === labels.length
        ? labels
        : mondays.map((m) => formatDisplayDate($locale, m, 'short'));
    };
    return Object.values(groups).map((g) => {
      const parts = (['above-usual', 'above-fte'] as const)
        .filter((kind) => g.kinds[kind])
        .map((kind) => {
          const mondays = g.kinds[kind]!;
          const named = label(mondays);
          const hoursThen = (m: string): number => {
            const w = byMonday.get(m);
            if (!w) return 0;
            return kind === 'above-fte' && teamIds
              ? hoursIn(w, teamIds, g.personId)
              : (w.byPerson[g.personId] ?? 0);
          };
          const most = Math.max(...mondays.map(hoursThen));
          return $t(`load.warn.${kind}`, {
            factor: formatNumber($locale, warnFactor, 1),
            limit: formatPercent($locale, maxFte),
            weeks:
              named.length > NAMED_WEEKS
                ? $t('load.warn.span', {
                    count: formatNumber($locale, named.length, 0),
                    first: named[0]!,
                    last: named[named.length - 1]!,
                  })
                : list.format(named),
            hours: hours(most),
          });
        });
      return {
        key: g.personId,
        text: $t('load.warn.person', {
          person: $workspace.people.find((p) => p.id === g.personId)?.name ?? g.personId,
          parts: parts.join('; '),
        }),
      };
    });
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

  const uid = $props.id();
</script>

<div class="load stack">
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
        {#if teamId}
          <th scope="col" class="num">{$t('load.col.all')}</th>
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
      {#each sorted as p (p.person.id)}
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
          </th>
          <td class="units"
            >{p.units.length === 0
              ? '–'
              : p.units.every((u) => u.area)
                ? $t('load.onlyArea')
                : p.units
                    .filter((u) => !u.area)
                    .map((u) => u.name)
                    .join(', ')}</td
          >
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
          {#if teamId}
            <td class="num">{formatPercent($locale, p.allShare)}</td>
          {/if}
          <td class="num nowrap">{$t('load.freeHours', { hours: hours(p.free) })}</td>
          <td class="num nowrap">
            {#if p.peak}
              {$t('load.peak', { week: weekLabel(p.peak.monday), hours: hours(p.peak.hours) })}
            {:else}
              {$t('load.none')}
            {/if}
          </td>
        </tr>
        <tr class="detail" id="{uid}-detail-{p.person.id}" hidden={openPerson !== p.person.id}>
          <td colspan={teamId ? 7 : 6}>
            {#if openPerson === p.person.id}
              {#if noHours(p)}
                <p class="note" data-set-hours>
                  {$t('load.detail.setHours', { structure: $t('area.view.structure') })}
                </p>
              {/if}
              {#if p.units.length === 0}
                <p class="note">{$t('load.detail.none')}</p>
              {:else}
                <ul class="split">
                  {#each p.units as u (u.id)}
                    <li>
                      <span class="unit-name">{u.name}</span>
                      <span class="muted"
                        >{[...u.roles, $t('load.detail.hours', { hours: hours(u.hours) })].join(
                          ' · ',
                        )}</span
                      >
                      <span class="num"
                        >{$t('load.detail.meetings', { hours: hours(u.meetings) })}</span
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
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
        >{$t('load.kpi.fte', { n: formatNumber($locale, fte(totalHours, hpw), 2) })}</span
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
          >{$t('load.kpi.share', {
            percent: formatPercent($locale, r.percent / 100),
            hours: formatNumber($locale, hpw, 0),
            fte: formatNumber($locale, r.fte, 2),
          })}</span
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
      {#if warningItems.length > 0}<span class="count" aria-hidden="true"
          >{warningItems.length}</span
        >{/if}
    </h3>
    <p class="note">
      {$t('load.warnings.rule', {
        factor: formatNumber($locale, $workspace.settings.thresholds.warnFactor, 1),
        limit: formatPercent($locale, $workspace.settings.thresholds.maxFte),
      })}
    </p>
    {#if warningItems.length === 0}
      <p class="note">{$t('load.warnings.none')}</p>
    {:else}
      <ul class="warnings">
        {#each warningItems as w (w.key)}
          <li class="warning">{w.text}</li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if $workspace.people.length > 0}
    <section class="card people">
      {@render region('person', $t('load.table.person'), personBody)}
      <p class="note below">
        {#if !$filter.personId}
          {area
            ? $t('load.table.person.noteArea', { name: area.name })
            : teamId
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
        <CostCard summary={costs} {rate} />
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
  .note.below {
    margin: 0.75rem 0 0;
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
  .split li {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
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
