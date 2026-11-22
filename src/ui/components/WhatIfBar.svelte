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
  let expanded = $state(false);
  const unitIn = (w: typeof $workspace, id: string) => units(w).find((u) => u.id === id);
  const arrow = (key: string, from: string, to: string, kind = '') => $t(key, { from, to, kind });
  /** Every field that differs, joined with "; " ("Team Alpha: sprint 2 → 3 weeks; sprint start …"). */
  function changeText(c: Change): string {
    const name = unitName($workspace, c.unitId, $levels.org);
    const parts: string[] = [];
    if (c.kind === 'meeting') {
      if (c.from.duration !== c.to.duration)
        parts.push(
          arrow(
            'whatif.bar.part.duration',
            formatNumber($locale, c.from.duration, 0),
            formatNumber($locale, c.to.duration, 0),
          ),
        );
      if (JSON.stringify(c.from.rule) !== JSON.stringify(c.to.rule)) {
        const old = $presentBase && unitIn($presentBase, c.unitId);
        const now = unitIn($workspace, c.unitId);
        parts.push(
          arrow(
            'whatif.bar.part.rule',
            old ? ruleShort(c.from.rule, old, $t, $locale) : '',
            now ? ruleShort(c.to.rule, now, $t, $locale) : '',
          ),
        );
      }
      return $t('whatif.bar.change.meeting', { name, meeting: c.name, parts: parts.join('; ') });
    }
    if (c.from.kind !== c.to.kind)
      parts.push(
        arrow(
          'whatif.bar.part.kind',
          $t(`team.cadence.kind.${c.from.kind}`),
          $t(`team.cadence.kind.${c.to.kind}`),
        ),
      );
    const kind = $t(`meet.kind.${c.to.kind}`);
    if (c.from.lengthWeeks !== c.to.lengthWeeks)
      parts.push(
        arrow(
          'whatif.bar.part.length',
          formatNumber($locale, c.from.lengthWeeks, 0),
          formatNumber($locale, c.to.lengthWeeks, 0),
          kind,
        ),
      );
    if (c.from.start !== c.to.start)
      parts.push(
        arrow(
          'whatif.bar.part.start',
          formatDisplayDate($locale, c.from.start, 'short'),
          formatDisplayDate($locale, c.to.start, 'short'),
          kind,
        ),
      );
    return $t('whatif.bar.change', { name, parts: parts.join('; ') });
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
    // Without a count before (no reference then), every team counts as aligned before.
    after?.inStep
      ? after.inStep.off.filter((o) => !before?.inStep?.off.some((b) => b.teamId === o.teamId))
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
      {#each list as c, i (i)}
        <span class:extra={i >= SHOWN && !expanded}>{changeText(c)}</span>
      {/each}
      {#if changes > SHOWN && !expanded}
        <button
          type="button"
          class="more"
          data-no-print
          aria-expanded="false"
          onclick={() => (expanded = true)}
        >
          {$t('whatif.bar.change.more', { n: changes - SHOWN })}
        </button>
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
            name: unitName($workspace, o.teamId, $levels.org),
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
  .changes > .extra {
    display: none;
  }
  @media print {
    .changes > .extra {
      display: inline;
    }
  }
  .changes > button.more {
    margin-left: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-text, var(--accent));
    text-decoration: underline;
    font: inherit;
    cursor: pointer;
  }
  .changes > span:not(:last-of-type)::after {
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
