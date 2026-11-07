<script lang="ts">
  import { onMount } from 'svelte';
  import { mondayOf } from '../../core/date';
  import { scopeTeams, weekRows } from '../../core/views';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import { filter, index, localToday, workspace } from '../state/workspace';

  interface Props {
    /** Switches to the Meetings view (empty-state hint). */
    onOpenMeetings: () => void;
  }
  let { onOpenMeetings }: Props = $props();

  const settings = $derived($workspace.settings);
  const rows = $derived(weekRows($workspace, $index, $filter));
  const teams = $derived(scopeTeams($workspace, $filter));
  const several = $derived(teams.length > 1);
  const hasEvents = $derived($workspace.teams.some((x) => x.events.length > 0));
  /** Roles in workspace order that carry hours in at least one row. */
  const roles = $derived($workspace.roles.filter((r) => rows.some((row) => r.id in row.byRole)));
  const currentMonday = mondayOf(localToday());

  const teamName = (id: string): string => $workspace.teams.find((x) => x.id === id)?.name ?? id;
  const kindOf = (id: string): string =>
    $workspace.teams.find((x) => x.id === id)?.cadence.kind ?? 'sprint';
  const withTeam = (label: string, id: string): string =>
    several ? $t('cal.withTeam', { label, team: teamName(id) }) : label;
  const hours = (n: number): string => formatNumber($locale, n, 1);

  let table: HTMLTableElement | undefined = $state();
  onMount(() => {
    // Moves the scroll position only; focus stays where it is.
    table?.querySelector('tr[aria-current]')?.scrollIntoView({ block: 'center' });
  });
</script>

<div class="weeks">
  {#if !hasEvents}
    <p class="hint">
      {$t('cal.noevents.text')}
      <button type="button" onclick={onOpenMeetings}>{$t('cal.noevents.button')}</button>
    </p>
  {/if}

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
          <th scope="col">{$t('weeks.col.cadence')}</th>
          <th scope="col">{$t('weeks.col.milestones')}</th>
          <th scope="col">{$t('weeks.col.holidays')}</th>
          <th scope="col">{$t('weeks.col.school')}</th>
          {#each roles as role (role.id)}
            <th scope="col" class="num">{role.name}</th>
          {/each}
          <th scope="col" class="num">{$t('weeks.col.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.monday)}
          {@const isCurrent = row.monday === currentMonday}
          <tr
            aria-current={isCurrent ? 'date' : undefined}
            class:current={isCurrent}
            data-monday={row.monday}
          >
            <th scope="row">
              {$t('weeks.week', { n: formatNumber($locale, row.week, 0) })}
              {#if isCurrent}<span class="badge">{$t('weeks.current')}</span>{/if}
            </th>
            <td>{formatDisplayDate($locale, row.monday, 'short')}</td>
            <td>
              {#each row.cadence as c (c.teamId)}
                <span class="item">
                  {withTeam(
                    $t(`cal.cadence.${kindOf(c.teamId)}`, {
                      n: formatNumber($locale, c.number, 0),
                    }),
                    c.teamId,
                  )}
                </span>
              {/each}
            </td>
            <td>
              {#each row.milestones as m (JSON.stringify([m.teamId, m.cycleId, m.id]))}
                <span class="item">{withTeam(m.name, m.teamId)}</span>
              {/each}
            </td>
            <td>
              {#each row.holidays as h (h.date)}
                <span class="item">{h.name[$locale]}</span>
              {/each}
            </td>
            <td>{row.schoolHoliday?.[$locale] ?? ''}</td>
            {#each roles as role (role.id)}
              <td class="num">{hours(row.byRole[role.id] ?? 0)}</td>
            {/each}
            <td class="num total">{hours(row.total)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
  .hint button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 52rem;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 0.3rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: var(--surface);
  }
  tbody th {
    font-weight: 600;
    white-space: nowrap;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .total {
    font-weight: 600;
  }
  .item {
    display: block;
  }
  tr.current {
    background: var(--surface);
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
</style>
