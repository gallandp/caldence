<script lang="ts" module>
  import type { CalEvent } from '../../core/model';

  /** What a what-if changes: one meeting's duration and rhythm, or a unit's cadence length. */
  export type WhatIfTarget =
    { kind: 'meeting'; unitId: string; event: CalEvent } | { kind: 'cadence'; unitId: string };
</script>

<script lang="ts">
  import { setAreaCadence, updateTeam, upsertEvent } from '../../core/edit';
  import { areaAsTeam, type Workspace } from '../../core/model';
  import { validate } from '../../core/validate';
  import { workspaceIndex } from '../../core/views';
  import { effectScope, whatIfEffect, type Effect } from '../../core/whatIf';
  import { formatEuro, formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { RULE_TYPES, ruleDraft, toRule, type RuleDraft } from '../meetings/rules';
  import { applyOwn } from '../state/problems.svelte';
  import { index, localToday, workspace } from '../state/workspace';
  import RuleFields from './RuleFields.svelte';

  let { target, onclose }: { target: WhatIfTarget; onclose: () => void } = $props();

  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined = $state();

  const area = $derived($workspace.areas.find((a) => a.id === target.unitId));
  const unit = $derived(
    $workspace.teams.find((x) => x.id === target.unitId) ?? (area ? areaAsTeam(area) : undefined),
  );

  // The draft starts from the meeting or cadence as it is when the sheet opens.
  function initial() {
    const ws = $workspace;
    const a = ws.areas.find((x) => x.id === target.unitId);
    const u = ws.teams.find((x) => x.id === target.unitId) ?? (a ? areaAsTeam(a) : undefined);
    const event = target.kind === 'meeting' ? target.event : undefined;
    return {
      duration: event?.duration ?? null,
      rule: ruleDraft(event?.rule, u!, localToday()),
      length: u?.cadence.lengthWeeks ?? null,
    };
  }
  const first = initial();
  let duration = $state<number | null>(first.duration);
  let rule = $state<RuleDraft>(first.rule);
  let length = $state<number | null>(first.length);
  const ruleTypes = RULE_TYPES.filter(
    (r) => r !== 'cycle-milestone' || (unit?.cycles.length ?? 0) > 0,
  );

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  /** The workspace with the draft applied, or the key of what is wrong with it. */
  const candidate = $derived.by(
    (): { ws: Workspace } | { error: string; params?: Record<string, string | number> } => {
      const ws = $workspace;
      if (!unit) return { error: 'error.type' };
      if (target.kind === 'meeting') {
        if (duration === null || !Number.isFinite(duration) || duration < 1)
          return { error: 'whatif.error.duration' };
        const event: CalEvent = {
          ...$state.snapshot(target.event),
          duration,
          rule: toRule($state.snapshot(rule)),
        };
        const checked = validate(upsertEvent(structuredClone(ws), unit.id, event)[0]);
        return checked.ok ? { ws: checked.value } : { error: 'whatif.error.rule' };
      }
      if (length === null || !Number.isInteger(length) || length < 1)
        return { error: 'whatif.error.length' };
      const n = length;
      const beyond = unit.events.find((e) => e.rule.type === 'cadence-day' && e.rule.day >= n * 7);
      if (beyond && beyond.rule.type === 'cadence-day')
        return {
          error: 'team.cadence.dayBeyond',
          params: { name: beyond.name, day: beyond.rule.day + 1, weeks: n },
        };
      const cadence = { ...unit.cadence, lengthWeeks: n };
      const next = area
        ? setAreaCadence(ws, unit.id, cadence)
        : updateTeam(ws, unit.id, { cadence });
      return next.ok ? { ws: next.value } : { error: 'whatif.error.length' };
    },
  );

  const scope = $derived(effectScope($workspace, target.unitId));
  const rate = $derived($workspace.settings.hourlyRate);
  const before = $derived(scope ? whatIfEffect($workspace, $index, scope, rate) : undefined);
  const after = $derived.by((): Effect | undefined => {
    if (!scope || !('ws' in candidate)) return undefined;
    return whatIfEffect(candidate.ws, workspaceIndex(candidate.ws), scope, rate);
  });
  const scopeName = $derived(
    $workspace.areas.find((a) => a.id === scope)?.name ??
      $workspace.teams.find((x) => x.id === scope)?.name ??
      '',
  );

  const signed = (n: number, format: (x: number) => string) =>
    (n > 0.004 ? '+' : n < -0.004 ? '−' : '±') + format(Math.abs(n));
  const hours = (n: number) => formatNumber($locale, n, 1);
  const euro = (n: number) => formatEuro($locale, n);
  const pct = (n: number) => formatPercent($locale, n);

  const title = $derived(
    target.kind === 'meeting'
      ? target.event.name
      : $t('whatif.cadence.title', { name: unit?.name ?? '' }),
  );

  function apply() {
    if (!('ws' in candidate)) return;
    const next = candidate.ws;
    const result = applyOwn(() => next);
    if (result.ok) close();
  }

  function close() {
    dialog?.close();
    onclose();
  }

  function onCancel(event: Event) {
    // Escape closes only the sheet; presenting goes on.
    event.preventDefault();
    event.stopPropagation();
    close();
  }
</script>

<dialog
  bind:this={dialog}
  class="whatif"
  aria-labelledby="{uid}-title"
  oncancel={onCancel}
  onkeydown={(e) => e.key === 'Escape' && e.stopPropagation()}
>
  <p class="eyebrow">{$t('whatif.eyebrow')}</p>
  <h2 id="{uid}-title">{title}</h2>
  <form
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      apply();
    }}
  >
    <div class="fields">
      {#if target.kind === 'meeting' && unit}
        <div class="field">
          <label for="{uid}-duration">{$t('meet.duration')}</label>
          <input id="{uid}-duration" type="number" min="1" step="1" bind:value={duration} />
        </div>
        <div class="field">
          <label for="{uid}-rule">{$t('meet.ruletype')}</label>
          <select id="{uid}-rule" bind:value={rule.type}>
            {#each ruleTypes as r (r)}
              <option value={r}>{$t(`meet.ruletype.${r}`)}</option>
            {/each}
          </select>
        </div>
        <RuleFields bind:draft={rule} team={unit} errors={{}} idPrefix={uid} />
      {:else}
        <div class="field">
          <label for="{uid}-length">{$t('team.cadence.length')}</label>
          <input id="{uid}-length" type="number" min="1" max="52" step="1" bind:value={length} />
        </div>
      {/if}
    </div>

    <div class="effect" aria-live="polite">
      <p class="effect-title">{$t('whatif.effect')}</p>
      {#if 'error' in candidate}
        <p class="error">{$t(candidate.error, candidate.params)}</p>
      {:else if before && after}
        <dl>
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
        </dl>
      {/if}
    </div>
    <p class="hint">{$t('whatif.hint')}</p>
    <div class="actions">
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
      <button type="submit" class="primary" disabled={'error' in candidate}
        >{$t('whatif.apply')}</button
      >
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(34rem, calc(100vw - 2 * var(--space)));
    padding: calc(var(--space) * 1.5);
    background: var(--bg);
    color: var(--text);
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .eyebrow {
    margin: 0;
    color: var(--accent-text, var(--accent));
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0.15rem 0 var(--space);
    font-size: 1.25rem;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-bottom: var(--space);
  }
  .fields > :global(*) {
    flex: 1 1 10rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
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
  .hint {
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
