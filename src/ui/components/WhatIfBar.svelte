<script lang="ts">
  import { workspaceIndex } from '../../core/views';
  import {
    effectScope,
    listChanges,
    whatIfEffect,
    type Change,
    type Effect,
  } from '../../core/whatIf';
  import { units, unitName } from '../../core/model';
  import {
    formatDisplayDate,
    formatEuro,
    formatNumber,
    levels,
    locale,
    translate as t,
  } from '../../i18n';
  import { ruleShort, stepReasonText } from '../meetings/rules';
  import { resetWhatIf } from '../state/present';
  import { activeTeamId, index, workspace } from '../state/workspace';
  import { loadValue } from './WhatIfEffect.svelte';

  /** Above every view while presenting: what the what-ifs changed so far, with a reset (M1). */
  const { presentBase } = workspace;

  const list = $derived($presentBase ? listChanges($presentBase, $workspace) : []);
  const changes = $derived(list.length);
  /** Two changes by name, the rest as "+N more" (#506). */
  const SHOWN = 2;
  const unitOf = (id: string) => units($workspace).find((u) => u.id === id);
  function changeText(c: Change): string {
    const unit = unitOf(c.unitId);
    const name = unitName($workspace, c.unitId, $levels.org);
    if (c.kind === 'meeting') {
      if (
        c.from.duration !== c.to.duration &&
        JSON.stringify(c.from.rule) === JSON.stringify(c.to.rule)
      )
        return $t('whatif.bar.change.duration', {
          name,
          meeting: c.name,
          from: formatNumber($locale, c.from.duration, 0),
          to: formatNumber($locale, c.to.duration, 0),
        });
      const rule = (r: typeof c.from.rule) => (unit ? ruleShort(r, unit, $t, $locale) : '');
      return $t('whatif.bar.change.rule', {
        name,
        meeting: c.name,
        from: rule(c.from.rule),
        to: rule(c.to.rule),
      });
    }
    if (c.from.kind !== c.to.kind)
      return $t('whatif.bar.change.kind', {
        name,
        from: $t(`team.cadence.kind.${c.from.kind}`),
        to: $t(`team.cadence.kind.${c.to.kind}`),
      });
    const kind = $t(`meet.kind.${c.to.kind}`);
    if (c.from.lengthWeeks !== c.to.lengthWeeks)
      return $t('whatif.bar.change.length', {
        name,
        kind,
        from: formatNumber($locale, c.from.lengthWeeks, 0),
        to: formatNumber($locale, c.to.lengthWeeks, 0),
      });
    return $t('whatif.bar.change.start', {
      name,
      kind,
      from: formatDisplayDate($locale, c.from.start, 'short'),
      to: formatDisplayDate($locale, c.to.start, 'short'),
    });
  }
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
  /** Teams aligned before and not after, with the reason (#478): said plainly, in warning colour. */
  const lost = $derived(
    before?.inStep && after?.inStep
      ? after.inStep.off.filter((o) => !before.inStep!.off.some((b) => b.teamId === o.teamId))
      : [],
  );
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
    <span class="changes" data-whatif-changes>
      {#each list.slice(0, SHOWN) as c, i (i)}<span>{changeText(c)}</span>{/each}
      {#if changes > SHOWN}
        <span class="muted" title={list.slice(SHOWN).map(changeText).join('\n')}>
          {$t('whatif.bar.change.more', { n: changes - SHOWN })}
        </span>
      {/if}
    </span>
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
      {#each lost as o (o.teamId)}
        <span class="lost" data-whatif-lost>
          {$t('whatif.bar.lost', {
            name: $workspace.teams.find((x) => x.id === o.teamId)?.name ?? '',
            reasons: o.reasons.map((r) => stepReasonText(r, $t, $locale)).join(', '),
          })}
        </span>
      {/each}
    {/if}
    <span class="muted" data-no-print>{$t('whatif.bar.discarded')}</span>
    <button type="button" class="secondary" data-no-print onclick={resetWhatIf}>
      {$t('whatif.reset')}
    </button>
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
  .changes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  .changes > span:not(:last-child)::after {
    content: ' ·';
    color: var(--text-muted);
  }
  .lost {
    color: var(--warn);
    font-weight: 600;
  }
  .muted {
    color: var(--text-muted);
  }
  button {
    margin-left: auto;
  }
</style>
