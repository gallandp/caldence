<script lang="ts" module>
  import type { Effect } from '../../core/whatIf';
  import { formatEuro, formatNumber, formatPercent, locale, translate as t } from '../../i18n';

  type Translate = (key: string, params?: Record<string, string | number>) => string;

  /** "5.6 h → 5.2 h · 16 % → 14 %": a meeting load with its hours; "24.5 h" never wraps. */
  export function loadValue(
    tr: Translate,
    loc: Parameters<typeof formatNumber>[0],
    b: Effect,
    a: Effect,
  ): string {
    return tr('whatif.effect.loadValue', {
      fromHours: formatNumber(loc, b.hours, 1),
      toHours: formatNumber(loc, a.hours, 1),
      from: formatPercent(loc, b.share),
      to: formatPercent(loc, a.share),
    }).replace(/(\d) h/g, '$1\u00a0h');
  }

  /** The change in hours as the rounded figures show it, so "25.0 h → 24.5 h" reads −0.5 h. */
  export const hoursDelta = (b: Effect, a: Effect) =>
    Math.round(a.hours * 10) / 10 - Math.round(b.hours * 10) / 10;
</script>

<script lang="ts">
  /**
   * The effect box: what a change does to hours, cost, meeting load and teams in step, measured
   * in `scopeName`. `error` replaces the numbers; `note` adds one line, e.g. the meetings that move.
   * `compact` shows the numbers as one line below 600 px (the meeting form on a phone).
   * `live` false drops the live region, where the box follows every keystroke of a form.
   * `team`: a team in an area; its own meeting load comes first, then the area's (#340). The
   * area's hours and cost follow the area's line then, so they are not read as the team's.
   */
  let {
    before,
    after,
    scopeName,
    error,
    note,
    compact = false,
    live = true,
    team,
  }: {
    before?: Effect;
    after?: Effect;
    scopeName: string;
    error?: string;
    note?: string;
    compact?: boolean;
    live?: boolean;
    team?: { name: string; before: Effect; after: Effect };
  } = $props();

  const signed = (n: number, format: (x: number) => string) =>
    (n > 0.004 ? '+' : n < -0.004 ? '−' : '±') + format(Math.abs(n));
  const hours = (n: number) => formatNumber($locale, n, 1);
  const euro = (n: number) => formatEuro($locale, n);
  const pct = (n: number) => formatPercent($locale, n);
  const load = (b: Effect, a: Effect) => loadValue($t, $locale, b, a);
  /** "16 % → 14 %", wrapping as a whole. */
  const arrow = (b: Effect, a: Effect) =>
    $t('whatif.arrow', { from: pct(b.share), to: pct(a.share) }).replace(/\s/g, ' ');
  /** One line of hours, cost per week (with a rate) and meeting load. */
  const own = (name: string, b: Effect, a: Effect) =>
    $t(b.cost && a.cost ? 'whatif.line.cost' : 'whatif.line', {
      hours: signed(hoursDelta(b, a), hours),
      cost: b.cost && a.cost ? signed(a.cost.perWeek - b.cost.perWeek, euro) : '',
      name,
      share: arrow(b, a),
    });
  /**
   * The compact one-line form. A team in an area shows its own change, then the area's meeting
   * load in short (#340, #364).
   */
  const line = (b: Effect, a: Effect) =>
    team
      ? $t('whatif.line.area', {
          line: own(team.name, team.before, team.after),
          name: scopeName,
          share: arrow(b, a),
        })
      : own(scopeName, b, a);
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
    {#snippet share(name: string, b: Effect, a: Effect)}
      <div>
        <dt>{$t('whatif.effect.share', { name })}</dt>
        <dd>{load(b, a)}</dd>
      </div>
    {/snippet}
    <dl class:compact>
      {#if team}
        {@render share(team.name, team.before, team.after)}
        {@render share(scopeName, before, after)}
      {/if}
      <div>
        <dt>{$t('whatif.effect.hours', { name: scopeName })}</dt>
        <dd class:up={hoursDelta(before, after) > 0.004}>
          {$t('whatif.perWeek.hours', { value: signed(hoursDelta(before, after), hours) })}
        </dd>
      </div>
      {#if before.cost && after.cost}
        <div>
          <dt>{$t('whatif.effect.cost', { name: scopeName })}</dt>
          <dd class:up={after.cost.perWeek - before.cost.perWeek > 0.004}>
            {$t('whatif.effect.costValue', {
              week: signed(after.cost.perWeek - before.cost.perWeek, euro),
              horizon: signed(after.cost.horizon - before.cost.horizon, euro),
            })}
          </dd>
        </div>
      {/if}
      {#if !team}
        {@render share(scopeName, before, after)}
      {/if}
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
