<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { mondayOf } from '../../core/date';
  import { loadPerWeek, warnings } from '../../core/load';
  import { schoolHolidayGap, scopeTeams, warnedWeeks, weekRows } from '../../core/views';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import { filter, index, localToday, workspace } from '../state/workspace';

  /** The calendar's Horizon level; the calendar shows the empty-state hint. */
  interface Props {
    /** The calendar's level switch, at the end of this toolbar. */
    levels?: Snippet;
  }
  let { levels }: Props = $props();

  const settings = $derived($workspace.settings);
  const rows = $derived(weekRows($workspace, $index, $filter));
  const teams = $derived(scopeTeams($workspace, $filter));
  const several = $derived(teams.length > 1);
  /** Roles in workspace order that carry hours in at least one row. */
  const roles = $derived($workspace.roles.filter((r) => rows.some((row) => r.id in row.byRole)));
  const currentMonday = mondayOf(localToday());

  const teamName = (id: string): string => $workspace.teams.find((x) => x.id === id)?.name ?? id;
  const kindOf = (id: string): string =>
    $workspace.teams.find((x) => x.id === id)?.cadence.kind ?? 'sprint';
  const withTeam = (label: string, id: string): string =>
    several ? $t('cal.withTeam', { label, team: teamName(id) }) : label;
  const hours = (n: number): string => formatNumber($locale, n, 1);

  /** The FTE check follows the team or person filter. */
  const allWarnings = $derived(warnings(loadPerWeek($workspace, $index), $workspace, $filter));
  /** People in scope with a high load, by Monday. */
  const warned = $derived(warnedWeeks($workspace, allWarnings, $filter));
  const names = $derived(new Map($workspace.people.map((p) => [p.id, p.name])));
  const list = $derived(new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' }));
  const people = (ids: string[]) => list.format(ids.map((id) => names.get(id) ?? id));

  /** The longest bar is the busiest week in view. */
  const peak = $derived(Math.max(0, ...rows.map((r) => r.total)));

  type Show = 'all' | 'warn' | 'cadence';
  let show = $state<Show>('all');
  const shown = $derived(
    rows.filter((row) =>
      show === 'warn' ? warned.has(row.monday) : show === 'cadence' ? row.cadence.length > 0 : true,
    ),
  );

  /** The selected region's school holidays end before the planning horizon does. */
  const coverage = $derived.by(() => {
    const region = schoolHolidayGap($workspace, $index);
    if (!region) return null;
    return $t('region.beyondKnown', {
      region: region.name[$locale],
      date: formatDisplayDate($locale, region.schoolHolidaysKnownUntil, 'short'),
    });
  });

  let table: HTMLTableElement | undefined = $state();
  onMount(() => {
    // Moves the scroll position only; focus stays where it is.
    table?.querySelector('tr[aria-current]')?.scrollIntoView({ block: 'center' });
  });
</script>

<div class="weeks">
  {#if coverage}
    <p class="hint">{coverage}</p>
  {/if}

  <div class="toolbar">
    <div class="segmented" role="group" aria-label={$t('weeks.show')}>
      {#each [['all', 'weeks.show.all'], ['warn', 'weeks.show.warn'], ['cadence', 'weeks.show.cadence']] as const as [value, key] (value)}
        <button type="button" aria-pressed={show === value} onclick={() => (show = value)}
          >{$t(key)}</button
        >
      {/each}
    </div>
    <span class="unit">{$t('weeks.unit')}</span>
    {@render levels?.()}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
  <div class="scroll" role="region" aria-label={$t('weeks.region')} tabindex="0">
    <table bind:this={table}>
      <caption>
        {$t('weeks.caption', {
          from: formatDisplayDate($locale, settings.horizon.from, 'short'),
          to: formatDisplayDate($locale, settings.horizon.to, 'short'),
        })}
      </caption>
      <thead>
        <tr>
          <th scope="col">{$t('weeks.col.week')}</th>
          <th scope="col">{$t('weeks.col.monday')}</th>
          <th scope="col">{$t('weeks.col.events')}</th>
          {#each roles as role (role.id)}
            <th scope="col" class="num">{role.name}</th>
          {/each}
          <th scope="col" class="num">{$t('weeks.col.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as row (row.monday)}
          {@const isCurrent = row.monday === currentMonday}
          {@const high = warned.get(row.monday)}
          <tr
            aria-current={isCurrent ? 'date' : undefined}
            class:current={isCurrent}
            data-monday={row.monday}
          >
            <th scope="row">
              {$t('weeks.week', { n: formatNumber($locale, row.week, 0) })}
              {#if isCurrent}<span class="badge">{$t('weeks.current')}</span>{/if}
            </th>
            <td class="date">{formatDisplayDate($locale, row.monday, 'short')}</td>
            <td>
              <span class="tags">
                {#each row.cadence as c (c.teamId)}
                  <span class="tag cadence">
                    {withTeam(
                      $t(`cal.cadence.${kindOf(c.teamId)}`, {
                        n: formatNumber($locale, c.number, 0),
                      }),
                      c.teamId,
                    )}
                  </span>
                {/each}
                {#each row.milestones as m (JSON.stringify([m.teamId, m.cycleId, m.id]))}
                  <span class="tag milestone">{withTeam(m.name, m.teamId)}</span>
                {/each}
                {#each row.holidays as h (h.date)}
                  <span class="tag holiday">{h.name[$locale]}</span>
                {/each}
                {#if row.schoolHoliday}
                  <span class="tag school">{row.schoolHoliday[$locale]}</span>
                {/if}
                {#if high}
                  <span class="tag warn">{$t('weeks.warn', { people: people(high) })}</span>
                {/if}
              </span>
            </td>
            {#each roles as role (role.id)}
              <td class="num">{hours(row.byRole[role.id] ?? 0)}</td>
            {/each}
            <td class="num total">
              <span class="load">
                <span class="bar" aria-hidden="true"
                  ><span
                    class:high={!!high}
                    style:width="{peak > 0 ? (row.total / peak) * 100 : 0}%"
                  ></span></span
                >
                {hours(row.total)}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="none" role="status">
    {show !== 'all' && rows.length > 0 && shown.length === 0 ? $t('weeks.none') : ''}
  </p>
</div>

<style>
  .weeks {
    min-width: 0;
  }
  .hint {
    padding: 0.75rem var(--space);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin-bottom: 1rem;
  }
  .unit {
    margin-left: auto;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .scroll {
    position: relative;
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 44rem;
  }
  /* Wide enough for the whole table: no inner scroll box, so the column headings can stay at
     the top of the window while the 53 weeks scroll past. */
  @media (min-width: 75rem) {
    .scroll {
      overflow-x: visible;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
    }
  }
  caption {
    text-align: left;
  }
  th,
  td {
    text-align: left;
  }
  tbody th {
    font-weight: 700;
    white-space: nowrap;
  }
  .date {
    color: var(--text-muted);
    white-space: nowrap;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag {
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .cadence {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .milestone {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .holiday {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .school,
  .warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .warn {
    border-color: color-mix(in srgb, var(--warn) 45%, transparent);
  }
  .total {
    font-weight: 700;
    width: 14rem;
  }
  .load {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }
  .bar {
    flex: 1;
    max-width: 9rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-gradient);
  }
  .bar > span.high {
    background: var(--hot);
  }
  .badge {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0 0.4rem;
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .none:empty {
    margin: 0;
  }
  .none {
    color: var(--text-muted);
  }
  @media (forced-colors: active) {
    .tag {
      border-color: CanvasText;
    }
    .bar {
      border: 1px solid CanvasText;
    }
    .bar > span {
      background: CanvasText;
    }
  }
</style>
