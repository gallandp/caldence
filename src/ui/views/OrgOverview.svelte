<script lang="ts">
  import { costSummary } from '../../core/cost';
  import { ORG_UNIT, lineSelection, orgName, hasLine } from '../../core/model';
  import { supplyingUnits } from '../../core/lineStaff';
  import UnitChip from '../components/UnitChip.svelte';
  import { openPlace } from '../state/jump';
  import { presenting } from '../state/present';
  import { hasDemands } from '../../core/staffingMap';
  import { loadSummary } from '../../core/views';
  import { formatEuro, formatNumber, levels, locale, translate as t } from '../../i18n';
  import RateInvite from '../components/RateInvite.svelte';
  import StaffingMap from '../components/StaffingMap.svelte';
  import { index, workspace } from '../state/workspace';

  /**
   * The organisation's overview (#322): today's figures over all areas and teams (meetings, time
   * in them, cost), and once the file has demands the staffing map.
   */
  let { onOpen }: { onOpen: (unitId: string) => void } = $props();

  const ws = $derived($workspace);
  const filter = { teamId: ORG_UNIT };
  const units = $derived([...ws.teams, ...ws.areas]);
  const meetings = $derived(units.reduce((n, u) => n + u.events.length, 0));
  const hours = $derived(loadSummary(ws, filter).byRole.reduce((s, r) => s + r.hours, 0));
  const rate = $derived(ws.settings.hourlyRate);
  const costs = $derived(rate ? costSummary(ws, $index, filter, rate) : undefined);
  const num = (n: number, d: number) => formatNumber($locale, n, d);
  const euro = (n: number) => formatEuro($locale, n);
  /** Cross links into the line (#397): per platform (and the products in none), its line units. */
  const withLine = $derived(hasLine(ws));
  const supply = $derived.by(() => {
    if (!withLine) return [];
    const inArea = new Set(ws.areas.flatMap((a) => a.teamIds));
    const rows = ws.areas.map((a) => ({
      id: a.id,
      name: a.name,
      units: supplyingUnits(ws, [a.id, ...a.teamIds]),
    }));
    const loose = ws.teams.filter((x) => !inArea.has(x.id));
    for (const x of loose) rows.push({ id: x.id, name: x.name, units: supplyingUnits(ws, x.id) });
    return rows;
  });
  const uid = $props.id();
</script>

<div class="org-overview">
  <section class="tiles" aria-label={$t('org.overview.tiles')}>
    <div class="tile">
      <span class="label">{$t('org.overview.meetings')}</span>
      <span class="value">{meetings}</span>
      <span class="sub">{$t('org.overview.meetings.sub', { n: units.length })}</span>
    </div>
    <div class="tile">
      <span class="label">{$t('org.overview.hours')}</span>
      <span class="value">{$t('org.overview.hours.value', { h: num(hours, 0) })}</span>
      <span class="sub"
        >{$t('org.overview.hours.sub', {
          fte: num(ws.settings.hoursPerWeek > 0 ? hours / ws.settings.hoursPerWeek : 0, 1),
        })}</span
      >
    </div>
    {#if costs}
      <div class="tile" data-org-cost tabindex="-1">
        <span class="label">{$t('org.overview.cost')}</span>
        <span class="value">{euro(costs.perWeek)}</span>
        <span class="sub">{$t('org.overview.cost.sub', { euro: euro(costs.horizon) })}</span>
      </div>
    {/if}
  </section>
  {#if !rate && meetings > 0}
    <div data-no-present><RateInvite focusAfter="[data-org-cost]" /></div>
  {/if}
  {#if withLine}
    <!-- Where each platform's people come from, and the matrix behind it (#397). -->
    <section class="from-line" aria-labelledby="{uid}-from-line">
      <div class="head">
        <h3 id="{uid}-from-line">{$t('cross.fromLine')}</h3>
        <button
          type="button"
          class="secondary"
          data-no-print
          onclick={() => openPlace(ORG_UNIT, 'matrix')}
          >{$t('cross.matrix', { name: orgName(ws, $levels.org) })}</button
        >
      </div>
      {#if !$presenting}
        <ul>
          {#each supply as row (row.id)}
            <li data-from-line={row.id}>
              <span class="unit">{row.name}</span>
              <span class="chips">
                {#each row.units as u (u.id)}
                  <UnitChip selection={lineSelection(u.id)} name={u.name} line />
                {:else}
                  <span class="muted">{$t('cross.noLine')}</span>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
  {#if hasDemands(ws)}
    <StaffingMap teams={ws.teams} {onOpen} />
  {/if}
</div>

<style>
  .from-line .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.6rem;
  }
  .from-line h3 {
    margin: 0;
    font-size: 1.15rem;
  }
  .from-line ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border);
  }
  .from-line li {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) 1fr;
    gap: 0.5rem 1rem;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .from-line .unit {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .from-line .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  @media (max-width: 40rem) {
    .from-line li {
      grid-template-columns: 1fr;
    }
  }
  .org-overview {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.75rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.85rem 1rem;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }
  .label,
  .sub {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .value {
    font-size: 1.6rem;
    font-weight: 750;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 40rem) {
    .value {
      font-size: 1.3rem;
    }
  }
</style>
