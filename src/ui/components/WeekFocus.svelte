<script lang="ts">
  import { tick } from 'svelte';
  import { isoWeek } from '../../core/date';
  import { capacity, fte, hoursIn, loadPerWeek } from '../../core/load';
  import { unitTeamIds } from '../../core/model';
  import { scopePeople } from '../../core/views';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { loadWeek } from '../state/focus';
  import { filter, index, workspace } from '../state/workspace';

  /** One week of Load in detail: each person's meeting hours in the selected team that week. */
  const uid = $props.id();
  const teamId = $derived($filter.personId ? undefined : $filter.teamId);
  const week = $derived(
    $loadWeek ? loadPerWeek($workspace, $index).find((w) => w.monday === $loadWeek) : undefined,
  );
  const maxFte = $derived($workspace.settings.thresholds.maxFte);
  const rows = $derived.by(() => {
    if (!week || !teamId) return [];
    const ids = unitTeamIds($workspace, teamId);
    const inScope = scopePeople($workspace, { teamId });
    return $workspace.people
      .filter((p) => inScope.has(p.id))
      .map((person) => {
        const hours = hoursIn(week, ids, person.id);
        const cap = capacity($workspace, person.id, teamId);
        const share = cap > 0 ? fte(hours, cap) : hours > 0 ? 1 : 0;
        return { person, hours, share, over: hours > 0 && (cap > 0 ? share > maxFte : true) };
      });
  });
  const unitName = $derived(
    [...$workspace.teams, ...$workspace.areas].find((u) => u.id === teamId)?.name ?? '',
  );

  const title = $derived(
    week
      ? $t('load.week.title', {
          week: $t('weeks.week', { n: formatNumber($locale, isoWeek(week.monday), 0) }),
          team: unitName,
        })
      : '',
  );

  let card: HTMLElement | undefined = $state();
  // Brought into view when a week is picked from the area overview.
  $effect(() => {
    if (!$loadWeek || !card) return;
    void tick().then(() => card?.scrollIntoView({ block: 'nearest' }));
  });
</script>

{#if week && teamId}
  <section
    class="card week-focus"
    aria-labelledby="{uid}-h"
    data-week-focus={week.monday}
    bind:this={card}
    tabindex="-1"
  >
    <div class="head">
      <h3 id="{uid}-h">
        {title}
      </h3>
      <button type="button" class="secondary" onclick={() => loadWeek.set(null)}
        >{$t('load.week.close')}</button
      >
    </div>
    <table>
      <thead>
        <tr>
          <th scope="col">{$t('load.col.person')}</th>
          <th scope="col" class="num">{$t('load.week.hours')}</th>
          <th scope="col" class="num">{$t('load.week.share')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.person.id)}
          <tr data-person={r.person.id} class:over={r.over}>
            <th scope="row">{r.person.name}</th>
            <td class="num">{formatNumber($locale, r.hours, 1)}</td>
            <td class="num"
              >{formatPercent($locale, r.share)}{#if r.over}<span class="flag"
                  >{$t('load.week.over', { max: formatPercent($locale, maxFte) })}</span
                >{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .head h3 {
    margin: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .flag {
    margin-left: 0.5rem;
    padding: 0.05rem 0.5rem;
    border-radius: 99px;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.78rem;
  }
</style>
