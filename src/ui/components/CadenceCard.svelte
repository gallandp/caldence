<script lang="ts">
  import { updateTeam } from '../../core/edit';
  import type { Cadence, Team } from '../../core/model';
  import { formatDisplayDate, locale, translate as t } from '../../i18n';
  import { Problems } from '../state/problems.svelte';
  import FieldError from './FieldError.svelte';

  let { team }: { team: Team } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, describe, invalid } = problems;

  /** The fields stay open while one of them shows an error. */
  let open = $state(false);
  const showFields = $derived(open || Object.keys(problems.errors).length > 0);

  /** Closing drops errors and unsaved drafts; the saved cadence stays. */
  function toggle() {
    if (!showFields) return (open = true);
    problems.errors = {};
    problems.epoch++;
    open = false;
  }

  const cadenceKinds = ['sprint', 'flow', 'pi'] as const;

  /** "Sprint · 2 weeks · from 01/05/2027" */
  const summary = $derived(
    [
      $t('team.cadence.kind.' + team.cadence.kind),
      $t(team.cadence.lengthWeeks === 1 ? 'meet.cadence.weeks.one' : 'meet.cadence.weeks.other', {
        n: team.cadence.lengthWeeks,
      }),
      $t('meet.cadence.from', { date: formatDisplayDate($locale, team.cadence.start, 'short') }),
    ].join(' · '),
  );

  function setCadence(field: keyof Cadence, label: string, patch: Partial<Cadence>) {
    const { id, cadence } = team;
    commit(`cadence-${field}`, label, (ws) =>
      updateTeam(ws, id, { cadence: { ...cadence, ...patch } }),
    );
  }

  function onLength(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const label = $t('team.cadence.length');
    if (input.value.trim() === '' || !Number.isFinite(n))
      return fail('cadence-lengthWeeks', 'error.number.invalid', label);
    const beyond = team.events.find((e) => e.rule.type === 'cadence-day' && e.rule.day >= n * 7);
    if (beyond && beyond.rule.type === 'cadence-day')
      return fail('cadence-lengthWeeks', 'team.cadence.dayBeyond', label, {
        name: beyond.name,
        day: beyond.rule.day + 1,
        weeks: n,
      });
    setCadence('lengthWeeks', label, { lengthWeeks: n });
  }

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
    <button
      type="button"
      class="secondary"
      aria-expanded={showFields}
      aria-controls="{uid}-fields"
      aria-label={showFields ? undefined : $t('meet.cadence.editLabel')}
      onclick={toggle}>{$t(showFields ? 'meet.cadence.done' : 'meet.cadence.edit')}</button
    >
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
      {/key}
    {/if}
  </div>
</section>

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
