<script lang="ts">
  import type { CostSummary } from '../../core/cost';
  import { formatEuro, locale, translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

  interface Props {
    summary: CostSummary;
    rate: number;
  }
  let { summary, rate }: Props = $props();

  const uid = $props.id();
  const euro = (n: number) => formatEuro($locale, n);
  const max = $derived(Math.max(0, ...summary.byCategory.map((c) => c.perWeek)));
  const category = (id: string) => $workspace.categories.find((c) => c.id === id);
</script>

<section class="card cost" aria-labelledby="{uid}-title" data-costs>
  <h3 id="{uid}-title">{$t('cost.title')}</h3>
  <p class="note">{$t('cost.hint', { rate: euro(rate) })}</p>
  <div class="totals">
    <p data-cost-week>
      <span class="value">{euro(summary.perWeek)}</span> <small>{$t('cost.perWeek')}</small>
    </p>
    <p data-cost-horizon>
      <span class="value">{euro(summary.horizon)}</span> <small>{$t('cost.horizon')}</small>
    </p>
  </div>
  {#if summary.byCategory.length > 0}
    <p class="caption" id="{uid}-cats">{$t('cost.byCategory')}</p>
    <ul class="bars" aria-labelledby="{uid}-cats">
      {#each summary.byCategory as c (c.categoryId)}
        <li data-category={c.categoryId}>
          <span class="name"
            ><span class="dot" aria-hidden="true" style:background={category(c.categoryId)?.colour}
            ></span>{category(c.categoryId)?.name ?? c.categoryId}</span
          >
          <span class="track" aria-hidden="true"
            ><span style:width="{max > 0 ? (c.perWeek / max) * 100 : 0}%"></span></span
          >
          <span class="amount">{euro(c.perWeek)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h3 {
    margin: 0 0 0.25rem;
  }
  .note {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 2rem;
    margin-bottom: 1rem;
  }
  .totals p {
    margin: 0;
  }
  .value {
    font-size: 1.6rem;
    font-weight: 780;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  small {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .caption {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(6rem, 12rem) 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-weight: 600;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }
  .track {
    display: block;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
    overflow: hidden;
  }
  .track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-gradient);
  }
  .amount {
    min-width: 4.5rem;
    text-align: right;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  @media (forced-colors: active) {
    .track {
      border: 1px solid CanvasText;
    }
    .track > span {
      background: CanvasText;
    }
  }
</style>
