<script lang="ts">
  import { workspaceIndex } from '../../core/views';
  import { countChanges, effectScope, whatIfEffect, type Effect } from '../../core/whatIf';
  import { unitName } from '../../core/model';
  import { formatEuro, horizonWeekCount, levels, locale, translate as t } from '../../i18n';
  import { resetWhatIf } from '../state/present';
  import { activeTeamId, index, workspace } from '../state/workspace';
  import { loadValue } from './WhatIfEffect.svelte';

  /** Above every view while presenting: what the what-ifs changed so far, with a reset (M1). */
  const { presentBase } = workspace;

  const changes = $derived($presentBase ? countChanges($presentBase, $workspace) : 0);
  const scope = $derived($activeTeamId ? effectScope($workspace, $activeTeamId) : undefined);
  const rate = $derived($workspace.settings.hourlyRate);
  const baseIndex = $derived($presentBase ? workspaceIndex($presentBase) : undefined);
  const before = $derived(
    $presentBase && baseIndex && scope && changes > 0
      ? whatIfEffect($presentBase, baseIndex, scope, rate)
      : undefined,
  );
  const after = $derived(
    scope && changes > 0 && $presentBase
      ? whatIfEffect($workspace, $index, scope, rate, $presentBase)
      : undefined,
  );
  const scopeName = $derived(unitName($workspace, scope, $levels.org));
  /** A team in an area: its own load comes first, the area's can round to the same (#340). */
  const team = $derived.by(() => {
    const id = $activeTeamId;
    if (!id || !$presentBase || !baseIndex || !scope || scope === id || changes === 0)
      return undefined;
    const b = whatIfEffect($presentBase, baseIndex, id);
    const a = whatIfEffect($workspace, $index, id);
    const name = $workspace.teams.find((x) => x.id === id)?.name ?? '';
    return b && a ? { name, before: b, after: a } : undefined;
  });
  /** "Meeting load Team Alpha: 5.6 h → 5.2 h · 16 % → 14 %" */
  const load = (name: string, b: Effect, a: Effect) =>
    $t('whatif.bar.share', { name, value: loadValue($t, $locale, b, a) });
  const signedEuro = (n: number) =>
    (n > 0.004 ? '+' : n < -0.004 ? '−' : '±') + formatEuro($locale, Math.abs(n));
</script>

<section
  class="whatif-bar"
  aria-label={$t('whatif.bar')}
  data-whatif-bar
  data-empty={changes === 0 || undefined}
>
  {#if changes === 0}
    <strong>{$t('whatif.bar')}</strong>
    <span class="muted">{$t('whatif.bar.empty')}</span>
  {:else}
    <strong>
      {$t(changes === 1 ? 'whatif.bar.count.one' : 'whatif.bar.count.other', {
        n: changes,
      })}
    </strong>
    <!-- Only the lines the changes touch; otherwise a line would read "16 % → 16 %". -->
    {#if team && team.before.hours !== team.after.hours}
      <span>{load(team.name, team.before, team.after)}</span>
    {/if}
    {#if before && after && (before.hours !== after.hours || before.inStep?.n !== after.inStep?.n)}
      <span>{load(scopeName, before, after)}</span>
      {#if before.cost && after.cost}
        <span>
          {$t('whatif.bar.cost', {
            name: scopeName,
            value: signedEuro(after.cost.perWeek - before.cost.perWeek),
            horizonValue: signedEuro(after.cost.horizon - before.cost.horizon),
          })}
          <span class="muted why" data-whatif-horizon-note>
            ({$t('cost.horizon.avg', {
              amount: signedEuro((after.cost.horizon - before.cost.horizon) / $horizonWeekCount),
              n: $horizonWeekCount,
            })})
          </span>
        </span>
      {/if}
      {#if before.inStep && after.inStep}
        <span>
          {$t('whatif.bar.inStep', {
            from: before.inStep.n,
            to: after.inStep.n,
            of: after.inStep.of,
          })}
        </span>
      {/if}
    {/if}
    <span class="muted" data-no-print>{$t('whatif.bar.discarded')}</span>
    <button type="button" class="secondary" data-no-print onclick={resetWhatIf}>
      {$t('whatif.reset')}
    </button>
  {/if}
</section>

<style>
  @media (max-width: 40rem) {
    .why {
      display: block;
    }
  }
  .whatif-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin: 0 0 var(--space);
    padding: 0.6rem 1rem;
    border: 1px dashed var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.93em;
  }
  strong {
    color: var(--accent-text, var(--accent));
  }
  .muted {
    color: var(--text-muted);
  }
  button {
    margin-left: auto;
  }
</style>
