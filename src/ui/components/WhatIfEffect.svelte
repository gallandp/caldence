<script lang="ts">
  import type { Effect } from '../../core/whatIf';
  import { formatEuro, formatNumber, formatPercent, locale, translate as t } from '../../i18n';

  /**
   * The "Wirkung" box: what a change does to hours, cost, Terminlast and teams in step, measured
   * in `scopeName`. `error` replaces the numbers; `note` adds one line, e.g. the meetings that move.
   * `compact` shows the numbers as one line below 600 px (the meeting form on a phone).
   * `extra` adds rows of its own.
   * `live` false drops the live region, where the box follows every keystroke of a form.
   */
  let {
    before,
    after,
    scopeName,
    error,
    note,
    compact = false,
    live = true,
    extra = [],
  }: {
    before?: Effect;
    after?: Effect;
    scopeName: string;
    error?: string;
    note?: string;
    compact?: boolean;
    live?: boolean;
    /** More rows below the numbers, e.g. the Mindestzusage of a product (#318). */
    extra?: { label: string; value: string }[];
  } = $props();

  const signed = (n: number, format: (x: number) => string) =>
    (n > 0.004 ? '+' : n < -0.004 ? '−' : '±') + format(Math.abs(n));
  const hours = (n: number) => formatNumber($locale, n, 1);
  const euro = (n: number) => formatEuro($locale, n);
  const pct = (n: number) => formatPercent($locale, n);
  /** The compact one-line form: hours, cost per week (with a rate) and Terminlast. */
  const line = (b: Effect, a: Effect) =>
    $t(b.cost && a.cost ? 'whatif.line.cost' : 'whatif.line', {
      hours: signed(a.hours - b.hours, hours),
      cost: b.cost && a.cost ? signed(a.cost.perWeek - b.cost.perWeek, euro) : '',
      name: scopeName,
      // "16 % → 14 %" wraps as a whole.
      share: $t('whatif.arrow', { from: pct(b.share), to: pct(a.share) }).replace(/\s/g, ' '),
    });
</script>

<div class="effect" aria-live={live ? 'polite' : undefined}>
  <p class="effect-title">{$t('whatif.effect')}</p>
  {#if error}
    <p class="error">{error}</p>
  {:else if before && after}
    {#if compact}
      <p class="line" aria-hidden="true">
        {line(before, after)}
      </p>
    {/if}
    <dl class:compact>
      <div>
        <dt>{$t('whatif.effect.hours')}</dt>
        <dd class:up={after.hours - before.hours > 0.004}>
          {$t('whatif.perWeek.hours', { value: signed(after.hours - before.hours, hours) })}
        </dd>
      </div>
      {#if before.cost && after.cost}
        <div>
          <dt>{$t('whatif.effect.cost')}</dt>
          <dd class:up={after.cost.perWeek - before.cost.perWeek > 0.004}>
            {$t('whatif.effect.costValue', {
              week: signed(after.cost.perWeek - before.cost.perWeek, euro),
              horizon: signed(after.cost.horizon - before.cost.horizon, euro),
            })}
          </dd>
        </div>
      {/if}
      <div>
        <dt>{$t('whatif.effect.share', { name: scopeName })}</dt>
        <dd>{$t('whatif.arrow', { from: pct(before.share), to: pct(after.share) })}</dd>
      </div>
      {#if before.inStep && after.inStep}
        <div>
          <dt>{$t('whatif.effect.inStep')}</dt>
          <dd>
            {$t('whatif.inStepValue', {
              from: before.inStep.n,
              to: after.inStep.n,
              of: after.inStep.of,
            })}
          </dd>
        </div>
      {/if}
      {#each extra as row (row.label)}
        <div>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      {/each}
    </dl>
    {#if note}<p class="note">{note}</p>{/if}
  {/if}
</div>

<style>
  .effect {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .effect-title {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-text, var(--accent));
  }
  dl {
    margin: 0;
    display: grid;
    gap: 0.3rem;
  }
  dl > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
  }
  dt,
  dd {
    margin: 0;
  }
  dd {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  dd.up {
    color: var(--warn);
  }
  .error {
    margin: 0;
    font-weight: 600;
  }
  .line {
    display: none;
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  /* On a phone the one line stands in; the list stays for screen readers. */
  @media (max-width: 599px) {
    .line {
      display: block;
    }
    dl.compact {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .note {
    margin: 0.5rem 0 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }
</style>
