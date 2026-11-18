<script lang="ts">
  import { workspaceIndex } from '../../core/views';
  import { countChanges, effectScope, whatIfEffect } from '../../core/whatIf';
  import { formatEuro, formatPercent, locale, translate as t } from '../../i18n';
  import { resetWhatIf } from '../state/present';
  import { activeTeamId, index, workspace } from '../state/workspace';

  /** Above every view while presenting: what the what-ifs changed so far, with a reset (M1). */
  const { presentBase } = workspace;

  const changes = $derived($presentBase ? countChanges($presentBase, $workspace) : 0);
  const scope = $derived($activeTeamId ? effectScope($workspace, $activeTeamId) : undefined);
  const rate = $derived($workspace.settings.hourlyRate);
  const before = $derived(
    $presentBase && scope && changes > 0
      ? whatIfEffect($presentBase, workspaceIndex($presentBase), scope, rate)
      : undefined,
  );
  const after = $derived(
    scope && changes > 0 ? whatIfEffect($workspace, $index, scope, rate) : undefined,
  );
  const scopeName = $derived(
    $workspace.areas.find((a) => a.id === scope)?.name ??
      $workspace.teams.find((x) => x.id === scope)?.name ??
      '',
  );
  const pct = (n: number) => formatPercent($locale, n);
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
    <strong
      >{$t(changes === 1 ? 'whatif.bar.count.one' : 'whatif.bar.count.other', {
        n: changes,
      })}</strong
    >
    <!-- Only when the changes touch the selected scope; otherwise the line would read "16 % → 16 %". -->
    {#if before && after && (before.hours !== after.hours || before.inStep?.n !== after.inStep?.n)}
      <span
        >{$t('whatif.bar.share', {
          name: scopeName,
          from: pct(before.share),
          to: pct(after.share),
        })}</span
      >
      {#if before.cost && after.cost}
        <span
          >{$t('whatif.bar.cost', {
            value: signedEuro(after.cost.perWeek - before.cost.perWeek),
            horizonValue: signedEuro(after.cost.horizon - before.cost.horizon),
          })}</span
        >
      {/if}
      {#if before.inStep && after.inStep}
        <span
          >{$t('whatif.bar.inStep', {
            from: before.inStep.n,
            to: after.inStep.n,
            of: after.inStep.of,
          })}</span
        >
      {/if}
    {/if}
    <span class="muted" data-no-print>{$t('whatif.bar.discarded')}</span>
    <button type="button" class="secondary" data-no-print onclick={resetWhatIf}
      >{$t('whatif.reset')}</button
    >
  {/if}
</section>

<style>
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
