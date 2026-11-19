<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { isoWeek } from '../../core/date';
  import { capacity, fte, hoursIn, loadPerWeek, overMax } from '../../core/load';
  import { unitLoadIds } from '../../core/model';
  import { scopePeople } from '../../core/views';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { loadWeek } from '../state/focus';
  import { filter, index, workspace } from '../state/workspace';

  /**
   * One week of Load in detail. Each person is judged on all their meetings that week ÷ their
   * hours in all their teams and areas, like the people table (#294); `here` keeps their part in
   * the selected team.
   */
  const uid = $props.id();
  const teamId = $derived($filter.personId ? undefined : $filter.teamId);
  const week = $derived(
    $loadWeek && $loadWeek.teamId === teamId
      ? loadPerWeek($workspace, $index).find((w) => w.monday === $loadWeek.monday)
      : undefined,
  );
  const maxFte = $derived($workspace.settings.thresholds.maxFte);
  const area = $derived($workspace.areas.some((a) => a.id === teamId));
  const rows = $derived.by(() => {
    if (!week || !teamId) return [];
    const ids = unitLoadIds($workspace, teamId);
    const inScope = scopePeople($workspace, { teamId });
    return $workspace.people
      .filter((p) => inScope.has(p.id))
      .map((person) => {
        const hours = week.byPerson[person.id] ?? 0;
        const cap = capacity($workspace, person.id);
        const hereHours = hoursIn(week, ids, person.id);
        const hereCap = capacity($workspace, person.id, teamId);
        return {
          person,
          hours,
          share: cap > 0 ? fte(hours, cap) : hours > 0 ? 1 : 0,
          cap,
          over: overMax(hours, cap, maxFte),
          here: { hours: hereHours, cap: hereCap, share: fte(hereHours, hereCap) },
        };
      });
  });
  const hours = (n: number): string => formatNumber($locale, n, 1);
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

  onDestroy(() => loadWeek.set(null));

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
          <th scope="col" class="num">{$t(area ? 'load.col.hereArea' : 'load.col.here')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.person.id)}
          {@const herePercent =
            r.here.cap > 0 || r.here.hours === 0
              ? formatPercent($locale, r.here.share)
              : $t('load.noHours')}
          <tr data-person={r.person.id} class:over={r.over}>
            <th scope="row">{r.person.name}</th>
            <td class="num"
              ><span class="long"
                >{$t('load.hoursOf', { hours: hours(r.hours), of: hours(r.cap) })}</span
              ><span class="short" aria-hidden="true">{hours(r.hours)}</span></td
            >
            <td class="num"
              >{formatPercent($locale, r.share)}{#if r.over}<span class="flag"
                  >{$t('load.week.over', { max: formatPercent($locale, maxFte) })}</span
                >{/if}</td
            >
            <td class="num"
              ><span class="long"
                >{$t('load.here', {
                  hours: hours(r.here.hours),
                  of: hours(r.here.cap),
                  percent: herePercent,
                })}</span
              ><span class="short" aria-hidden="true">{herePercent}</span></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  /* Scrolled into view below the sticky "back to the overview" button (top 0.75rem, 2.75rem
     high in Shell.svelte), so the heading is not hidden behind it (#302). */
  .week-focus {
    scroll-margin-top: 4.25rem;
  }
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
  .short {
    display: none;
  }
  /* Phones: hours and the part in the team in short; the full text stays for screen readers. */
  @media (max-width: 600px) {
    .short {
      display: inline;
    }
    .long {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .flag {
    margin-left: 0.5rem;
    padding: 0.05rem 0.5rem;
    border-radius: 99px;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.78rem;
  }
  @media (max-width: 600px) {
    .flag {
      display: block;
      width: fit-content;
      margin: 0.25rem 0 0 auto;
      border-radius: 0.5rem;
    }
  }
</style>
