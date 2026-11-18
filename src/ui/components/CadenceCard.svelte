<script lang="ts">
  import { onMount } from 'svelte';
  import { mondayOf } from '../../core/date';
  import { setAreaCadence, setCadenceLength, shiftedDays, updateTeam } from '../../core/edit';
  import type { Area, Cadence, Team } from '../../core/model';
  import { formatDisplayDate, locale, translate as t } from '../../i18n';
  import { Problems } from '../state/problems.svelte';
  import { activeTeamId, localToday } from '../state/workspace';
  import { movedText } from '../meetings/rules';
  import FieldError from './FieldError.svelte';
  import WhatIfSheet from './WhatIfSheet.svelte';
  import { presenting } from '../state/present';

  /** With `area`, the cadence is the area's own and optional (`team` is the area as a team). */
  let { team, area }: { team: Team; area?: Area } = $props();
  /** An area without a cadence of its own. */
  const none = $derived(!!area && !area.cadence);

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, describe, invalid } = problems;

  /** The fields stay open while one of them shows an error. */
  let open = $state(false);
  // Another team starts with its cadence as one line.
  onMount(() => activeTeamId.subscribe(() => (open = false)));
  const showFields = $derived(open || Object.keys(problems.errors).length > 0);

  /** Closing drops errors and unsaved drafts; the saved cadence stays. */
  function toggle() {
    if (!showFields) return (open = true);
    problems.errors = {};
    problems.epoch++;
    open = false;
  }

  const cadenceKinds = ['sprint', 'flow', 'pi'] as const;

  /** While presenting, the length changes only as a what-if (M1). */
  let whatIf = $state(false);
  let whatIfButton: HTMLButtonElement | undefined = $state();
  // Presenting starts: open fields would change the file.
  $effect(() => {
    if ($presenting) {
      open = false;
      problems.errors = {};
    }
  });

  /** "Sprint · 2 weeks · from 01/05/2027" */
  const summary = $derived(
    none
      ? $t('area.cadence.none')
      : [
          $t('team.cadence.kind.' + team.cadence.kind),
          $t(
            team.cadence.lengthWeeks === 1 ? 'meet.cadence.weeks.one' : 'meet.cadence.weeks.other',
            {
              n: team.cadence.lengthWeeks,
            },
          ),
          $t('meet.cadence.from', {
            date: formatDisplayDate($locale, team.cadence.start, 'short'),
          }),
        ].join(' · '),
  );

  /** An area gets a cadence: a planning interval of 10 weeks from this Monday, then edited. */
  function addCadence() {
    if (!area) return;
    const id = area.id;
    const cadence: Cadence = { kind: 'pi', lengthWeeks: 10, start: mondayOf(localToday()) };
    if (commit('cadence-kind', $t('team.cadence'), (ws) => setAreaCadence(ws, id, cadence)))
      open = true;
  }

  function removeCadence() {
    if (!area) return;
    const id = area.id;
    if (commit('cadence-remove', $t('team.cadence'), (ws) => setAreaCadence(ws, id, undefined)))
      open = false;
  }

  function setCadence(field: keyof Cadence, label: string, patch: Partial<Cadence>) {
    const { id, cadence } = team;
    moved = undefined;
    commit(`cadence-${field}`, label, (ws) =>
      area
        ? setAreaCadence(ws, id, { ...cadence, ...patch })
        : updateTeam(ws, id, { cadence: { ...cadence, ...patch } }),
    );
  }

  function onLength(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const label = $t('team.cadence.length');
    if (input.value.trim() === '' || !Number.isFinite(n))
      return fail('cadence-lengthWeeks', 'error.number.invalid', label);
    const { id, events, cadence } = team;
    const text = movedText(events, shiftedDays(events, cadence.lengthWeeks, n), $t);
    moved = undefined;
    if (commit('cadence-lengthWeeks', label, (ws) => setCadenceLength(ws, id, n)))
      moved = { text, epoch: problems.epoch };
  }

  /** The meetings the last length change moved; gone with the next change, undo, team or closing. */
  let moved = $state<{ text: string; epoch: number }>();
  const movedLine = $derived(moved?.epoch === problems.epoch ? moved.text : '');

  function onStart(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    const label = $t('team.cadence.start');
    if (value === '') return fail('cadence-start', 'error.required', label);
    setCadence('start', label, { start: value });
  }
</script>

<section class="card cadence" aria-labelledby="{uid}-h">
  <div class="line">
    <h3 id="{uid}-h">{$t('team.cadence')}</h3>
    <p class="summary">{summary}</p>
    {#if $presenting}
      {#if !none}
        <button
          type="button"
          class="secondary"
          data-whatif-cadence
          data-no-print
          bind:this={whatIfButton}
          onclick={() => (whatIf = true)}>{$t('whatif.open')}</button
        >
      {/if}
    {:else if none}
      <button type="button" class="secondary" data-no-print onclick={addCadence}
        >{$t('area.cadence.add')}</button
      >
    {:else}<button
        type="button"
        class="secondary"
        data-no-print
        aria-expanded={showFields}
        aria-controls="{uid}-fields"
        aria-label={showFields ? undefined : $t('meet.cadence.editLabel')}
        onclick={toggle}>{$t(showFields ? 'meet.cadence.done' : 'meet.cadence.edit')}</button
      >{/if}
  </div>
  <div id="{uid}-fields" hidden={!showFields}>
    {#if showFields}
      <p class="hint">{$t('team.cadence.hint')}</p>
      {#key problems.epoch}
        <div class="grid">
          <div class="field">
            <label for="{uid}-kind">{$t('team.cadence.kind')}</label>
            <select
              id="{uid}-kind"
              value={team.cadence.kind}
              aria-invalid={invalid('cadence-kind')}
              aria-describedby={describe('cadence-kind')}
              onchange={(e) =>
                setCadence('kind', $t('team.cadence.kind'), {
                  kind: e.currentTarget.value as Cadence['kind'],
                })}
            >
              {#each cadenceKinds as kind (kind)}
                <option value={kind}>{$t('team.cadence.kind.' + kind)}</option>
              {/each}
            </select>
            <FieldError {problems} id="cadence-kind" />
          </div>
          <div class="field">
            <label for="{uid}-length">{$t('team.cadence.length')}</label>
            <input
              id="{uid}-length"
              type="number"
              min="1"
              step="1"
              value={team.cadence.lengthWeeks}
              aria-invalid={invalid('cadence-lengthWeeks')}
              aria-describedby={describe('cadence-lengthWeeks')}
              onchange={onLength}
            />
            <FieldError {problems} id="cadence-lengthWeeks" />
          </div>
          <div class="field">
            <label for="{uid}-start">{$t('team.cadence.start')}</label>
            <input
              id="{uid}-start"
              type="date"
              value={team.cadence.start}
              aria-invalid={invalid('cadence-start')}
              aria-describedby={describe('cadence-start')}
              onchange={onStart}
            />
            <FieldError {problems} id="cadence-start" />
          </div>
        </div>
        {#if area}
          <p class="remove">
            <button type="button" class="secondary" onclick={removeCadence}
              >{$t('area.cadence.remove')}</button
            >
          </p>
          <FieldError {problems} id="cadence-remove" />
        {/if}
      {/key}
      <p class="moved" class:empty={!movedLine} role="status">{movedLine}</p>
    {/if}
  </div>
</section>

{#if whatIf}
  <WhatIfSheet
    target={{ kind: 'cadence', unitId: team.id }}
    onclose={() => {
      whatIf = false;
      whatIfButton?.focus();
    }}
  />
{/if}

<style>
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
  }
  h3 {
    margin: 0;
  }
  .summary {
    flex: 1 1 12rem;
    margin: 0;
    color: var(--text-muted);
  }
  .hint {
    margin: 1rem 0;
    color: var(--text-muted);
  }
  .remove {
    margin: 0.75rem 0 0;
  }
  .moved {
    margin: 0.75rem 0 0;
  }
  .moved.empty {
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
  }
  .grid input,
  .grid select {
    width: 100%;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
</style>
