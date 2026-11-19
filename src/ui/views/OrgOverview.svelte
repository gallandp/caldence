<script lang="ts">
  import { costSummary } from '../../core/cost';
  import { ORG_UNIT, orgName } from '../../core/model';
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
  {#if hasDemands(ws)}
    <StaffingMap
      teams={ws.teams}
      {onOpen}
      scope={{ selection: ORG_UNIT, name: orgName(ws, $levels.org) }}
    />
  {/if}
</div>

<style>
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
