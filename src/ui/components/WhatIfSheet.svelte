<script lang="ts" module>
  import type { CalEvent } from '../../core/model';

  /** What a what-if changes: one meeting's duration and rhythm, or a unit's cadence length and start. */
  export type WhatIfTarget =
    { kind: 'meeting'; unitId: string; event: CalEvent } | { kind: 'cadence'; unitId: string };
</script>

<script lang="ts">
  import { setCadenceLength, setCadenceStart, shiftedDays, upsertEvent } from '../../core/edit';
  import { areaAsTeam, findArea, unitName, type Workspace } from '../../core/model';
  import { validate } from '../../core/validate';
  import { workspaceIndex } from '../../core/views';
  import { effectScope, whatIfEffect, type Effect } from '../../core/whatIf';
  import { levels, translate as t } from '../../i18n';
  import { movedText, RULE_TYPES, ruleDraft, toRule, type RuleDraft } from '../meetings/rules';
  import { applyOwn } from '../state/problems.svelte';
  import { index, localToday, workspace } from '../state/workspace';
  import RuleFields from './RuleFields.svelte';
  import WhatIfEffect from './WhatIfEffect.svelte';

  let { target, onclose }: { target: WhatIfTarget; onclose: () => void } = $props();

  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined = $state();

  const area = $derived(findArea($workspace, target.unitId));
  const unit = $derived(
    $workspace.teams.find((x) => x.id === target.unitId) ?? (area ? areaAsTeam(area) : undefined),
  );

  // The draft starts from the meeting or cadence as it is when the sheet opens.
  function initial() {
    const ws = $workspace;
    const a = findArea(ws, target.unitId);
    const u = ws.teams.find((x) => x.id === target.unitId) ?? (a ? areaAsTeam(a) : undefined);
    const event = target.kind === 'meeting' ? target.event : undefined;
    return {
      duration: event?.duration ?? null,
      rule: ruleDraft(event?.rule, u!, localToday()),
      length: u?.cadence.lengthWeeks ?? null,
      start: u?.cadence.start ?? '',
    };
  }
  const first = initial();
  let duration = $state<number | null>(first.duration);
  let rule = $state<RuleDraft>(first.rule);
  let length = $state<number | null>(first.length);
  let start = $state<string>(first.start);
  const ruleTypes = RULE_TYPES.filter(
    (r) => r !== 'cycle-milestone' || (unit?.cycles.length ?? 0) > 0,
  );

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  /** The workspace with the draft applied, or the key of what is wrong with it. */
  const candidate = $derived.by(
    ():
      | { ws: Workspace; moved?: string }
      | { error: string; params?: Record<string, string | number> } => {
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
      const next = setCadenceLength(ws, unit.id, n);
      if (!next.ok) {
        const error = next.errors[0];
        return error?.key === 'team.cadence.dayBeyond'
          ? { error: error.key, params: error.params }
          : { error: 'whatif.error.length' };
      }
      // A new start moves no meeting: it keeps each meeting's cadence day (#444).
      const moved =
        start === unit.cadence.start ? next : setCadenceStart(next.value, unit.id, start);
      if (!moved.ok) return { error: 'whatif.error.start' };
      const days = shiftedDays(unit.events, unit.cadence.lengthWeeks, n);
      return { ws: moved.value, moved: movedText(unit.events, days, $t) };
    },
  );

  const scope = $derived(effectScope($workspace, target.unitId));
  const rate = $derived($workspace.settings.hourlyRate);
  const before = $derived(scope ? whatIfEffect($workspace, $index, scope, rate) : undefined);
  const candidateIndex = $derived('ws' in candidate ? workspaceIndex(candidate.ws) : undefined);
  const after = $derived.by((): Effect | undefined => {
    if (!scope || !('ws' in candidate) || !candidateIndex) return undefined;
    return whatIfEffect(candidate.ws, candidateIndex, scope, rate);
  });
  /** A team in an area: its own load comes first, the area's can round to the same (#340). */
  const team = $derived.by(() => {
    const id = target.unitId;
    if (scope === id || !('ws' in candidate) || !candidateIndex) return undefined;
    const b = whatIfEffect($workspace, $index, id);
    const a = whatIfEffect(candidate.ws, candidateIndex, id);
    return b && a ? { name: unit?.name ?? '', before: b, after: a } : undefined;
  });
  const scopeName = $derived(unitName($workspace, scope, $levels.org));

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
        <div class="field">
          <label for="{uid}-start">{$t('team.cadence.start')}</label>
          <input id="{uid}-start" type="date" bind:value={start} />
        </div>
      {/if}
    </div>

    <WhatIfEffect
      {before}
      {after}
      {scopeName}
      {team}
      error={'error' in candidate ? $t(candidate.error, candidate.params) : undefined}
      note={'moved' in candidate ? candidate.moved : undefined}
    />
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
