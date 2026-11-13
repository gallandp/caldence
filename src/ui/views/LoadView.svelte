<script lang="ts">
  import { costSummary } from '../../core/cost';
  import { isoWeek } from '../../core/date';
  import { fte, loadPerWeek, warnings } from '../../core/load';
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

  const people = $derived(
    $filter.personId
      ? $workspace.people.filter((p) => p.id === $filter.personId)
      : $workspace.people,
  );

  const perPerson = $derived(
    people.map((person) => {
      const total = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
      const average = weeks.length > 0 ? total / weeks.length : 0;
      let peak: { monday: string; hours: number } | undefined;
      for (const w of weeks) {
        const h = w.byPerson[person.id] ?? 0;
        if (h > 0 && (peak === undefined || h > peak.hours)) peak = { monday: w.monday, hours: h };
      }
      return { person, average, fte: fte(average, person.hoursPerWeek), peak };
    }),
  );

  const allWarnings = $derived(warnings(weeks, $workspace));

  /** One line per person and kind, listing its weeks and the highest hours among them. */
  const warningItems = $derived.by(() => {
    const byMonday = new Map(weeks.map((w) => [w.monday, w]));
    const people = scopePeople($workspace, $filter);
    const groups = record<{ personId: string; kind: string; mondays: string[]; max: number }>();
    for (const w of allWarnings) {
      if (!people.has(w.personId)) continue;
      const group = (groups[`${w.personId}/${w.kind}`] ??= {
        personId: w.personId,
        kind: w.kind,
        mondays: [],
        max: 0,
      });
      group.mondays.push(w.monday);
      group.max = Math.max(group.max, byMonday.get(w.monday)?.byPerson[w.personId] ?? 0);
    }
    const list = new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' });
    return Object.entries(groups).map(([key, g]) => {
      // Week numbers repeat on horizons longer than a year: then the Mondays are named instead.
      const labels = g.mondays.map(weekLabel);
      const named =
        new Set(labels).size === labels.length
          ? labels
          : g.mondays.map((m) => formatDisplayDate($locale, m, 'short'));
      return {
        key,
        text: $t(`load.warn.${g.kind}`, {
          weeks: list.format(named),
          person: $workspace.people.find((p) => p.id === g.personId)?.name ?? g.personId,
          hours: hours(g.max),
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
          <th scope="row">
            <span
              class="dot"
              aria-hidden="true"
              style:background={$workspace.categories.find((x) => x.id === c.categoryId)?.colour}
            ></span>{categoryName(c.categoryId)}
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
        <th scope="col" class="num">{$t('load.col.hours')}</th>
        <th scope="col" class="num">{$t('load.col.fte')}</th>
        <th scope="col" class="num">{$t('load.col.peak')}</th>
      </tr>
    </thead>
    <tbody>
      {#each perPerson as p (p.person.id)}
        <tr data-person={p.person.id}>
          <th scope="row">{p.person.name}</th>
          <td class="num">{hours(p.average)}</td>
          <td class="num">{formatNumber($locale, p.fte, 2)}</td>
          <td class="num">
            {#if p.peak}
              {$t('load.peak', { week: weekLabel(p.peak.monday), hours: hours(p.peak.hours) })}
            {:else}
              {$t('load.none')}
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

  <div class="grid">
    <div class="col">
      {#if peak}
        <section class="card" aria-labelledby="{uid}-chart">
          <h3 id="{uid}-chart">{$t('load.chart')}</h3>
          <p class="note">{$t('load.chart.hint')}</p>
          <div class="chart" role="img" aria-label={chartLabel}>
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
          <div class="axis" aria-hidden="true">
            <span>{weekLabel(rows[0]!.monday)}</span>
            <span>{weekLabel(rows[Math.floor(rows.length / 2)]!.monday)}</span>
            <span>{weekLabel(rows[rows.length - 1]!.monday)}</span>
          </div>
        </section>
      {/if}
      <div class="card">{@render region('base', $t('load.table.base'), baseBody)}</div>
    </div>
    <div class="col">
      {#if costs && rate}
        <CostCard summary={costs} {rate} />
      {/if}
      {#if $workspace.people.length > 0}
        <div class="card">
          {@render region('person', $t('load.table.person'), personBody)}
          {#if !$filter.personId}<p class="note below">{$t('load.table.person.note')}</p>{/if}
        </div>
      {/if}
      <section class="card" aria-labelledby="{uid}-warn">
        <h3 id="{uid}-warn">
          {$t('load.warnings')}
          {#if warningItems.length > 0}<span class="count" aria-hidden="true"
              >{warningItems.length}</span
            >{/if}
        </h3>
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
  .chart {
    position: relative;
    height: 9rem;
    margin-top: 0.5rem;
  }
  .chart {
    overflow: hidden;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    /* Long horizons (up to five years) must still fit: the gap shrinks with the width. */
    gap: clamp(0px, 0.4%, 2px);
    height: 100%;
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
  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    margin-right: 0.55rem;
    border-radius: 50%;
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
