<script lang="ts">
  import type { Team } from '../../core/model';
  import { weekdayName, type RuleDraft } from '../meetings/rules';
  import { translate as t, locale } from '../../i18n';

  let {
    draft = $bindable(),
    team,
    errors,
    idPrefix,
  }: {
    draft: RuleDraft;
    team: Team;
    /** Error i18n keys by field path relative to the event (`rule.weekday`, ...). */
    errors: Record<string, string>;
    idPrefix: string;
  } = $props();

  const id = (field: string) => `${idPrefix}-rule-${field}`;
  const describe = (field: string) => (errors[`rule.${field}`] ? `${id(field)}-err` : undefined);
  const invalid = (field: string) => (errors[`rule.${field}`] ? 'true' : undefined);

  const milestones = $derived(team.cycles.find((c) => c.id === draft.cycleId)?.milestones ?? []);
  const kindName = $derived($t(`meet.kind.${team.cadence.kind}`));
  const maxDay = $derived(team.cadence.lengthWeeks * 7);
  const weekdays = [1, 2, 3, 4, 5, 6, 7];
  const nths = [1, 2, 3, 4, 5, -1];

  // A milestone that does not belong to the chosen cycle falls back to that cycle's first one.
  $effect(() => {
    if (draft.type === 'cycle-milestone' && !milestones.some((m) => m.id === draft.milestoneId))
      draft.milestoneId = milestones[0]?.id ?? '';
  });
</script>

{#snippet err(field: string, label: string)}
  {#if errors[`rule.${field}`]}
    <p class="field-error" id="{id(field)}-err">{$t(errors[`rule.${field}`]!, { path: label })}</p>
  {/if}
{/snippet}

{#snippet weekdayField()}
  <div class="field">
    <label for={id('weekday')}>{$t('meet.rule.weekday')}</label>
    <select
      id={id('weekday')}
      data-field="rule.weekday"
      bind:value={draft.weekday}
      aria-invalid={invalid('weekday')}
      aria-describedby={describe('weekday')}
    >
      {#each weekdays as w (w)}
        <option value={w}>{weekdayName($locale, w)}</option>
      {/each}
    </select>
    {@render err('weekday', $t('meet.rule.weekday'))}
  </div>
{/snippet}

<div class="rule">
  {#if draft.type === 'weekly'}
    {@render weekdayField()}
  {:else if draft.type === 'weekdays'}
    <fieldset
      class="days"
      id={id('weekdays')}
      data-field="rule.weekdays"
      aria-describedby={describe('weekdays')}
    >
      <legend>{$t('meet.rule.weekdays')}</legend>
      <div class="checks">
        {#each weekdays as w (w)}
          <label class="check">
            <input
              type="checkbox"
              value={w}
              data-field="rule.weekdays"
              bind:group={draft.weekdays}
            />
            {weekdayName($locale, w)}
          </label>
        {/each}
      </div>
      {@render err('weekdays', $t('meet.rule.weekdays'))}
    </fieldset>
  {:else if draft.type === 'every-n-weeks'}
    {@render weekdayField()}
    <div class="field">
      <label for={id('n')}>{$t('meet.rule.n')}</label>
      <input
        id={id('n')}
        type="number"
        min="1"
        step="1"
        data-field="rule.n"
        bind:value={draft.n}
        aria-invalid={invalid('n')}
        aria-describedby={describe('n')}
      />
      {@render err('n', $t('meet.rule.n'))}
    </div>
    <div class="field">
      <label for={id('anchor')}>{$t('meet.rule.anchor')}</label>
      <input
        id={id('anchor')}
        type="date"
        data-field="rule.anchor"
        bind:value={draft.anchor}
        aria-invalid={invalid('anchor')}
        aria-describedby={describe('anchor')}
      />
      {@render err('anchor', $t('meet.rule.anchor'))}
    </div>
  {:else if draft.type === 'monthly-nth-weekday'}
    {@render weekdayField()}
    <div class="field">
      <label for={id('nth')}>{$t('meet.rule.nth')}</label>
      <select
        id={id('nth')}
        data-field="rule.nth"
        bind:value={draft.nth}
        aria-invalid={invalid('nth')}
        aria-describedby={describe('nth')}
      >
        {#each nths as n (n)}
          <option value={n}>{$t(n === -1 ? 'meet.nth.last' : `meet.nth.${n}`)}</option>
        {/each}
      </select>
      {@render err('nth', $t('meet.rule.nth'))}
    </div>
  {:else if draft.type === 'cadence-day'}
    <div class="field">
      <label for={id('day')}>{$t('meet.rule.day')}</label>
      <input
        id={id('day')}
        type="number"
        min="1"
        max={maxDay}
        step="1"
        data-field="rule.day"
        bind:value={draft.day}
        aria-invalid={invalid('day')}
        aria-describedby={[describe('day'), `${id('day')}-hint`].filter(Boolean).join(' ')}
      />
      <p class="hint" id="{id('day')}-hint">
        {$t('meet.rule.day.hint', { kind: kindName, max: maxDay })}
      </p>
      {@render err('day', $t('meet.rule.day'))}
    </div>
  {:else if draft.type === 'cycle-milestone'}
    <div class="field">
      <label for={id('cycleId')}>{$t('meet.rule.cycle')}</label>
      <select
        id={id('cycleId')}
        data-field="rule.cycleId"
        bind:value={draft.cycleId}
        aria-invalid={invalid('cycleId')}
        aria-describedby={[describe('cycleId'), team.cycles.length === 0 && `${id('cycleId')}-hint`]
          .filter(Boolean)
          .join(' ') || undefined}
      >
        {#if team.cycles.length === 0}<option value="">{$t('meet.option.none')}</option>{/if}
        {#each team.cycles as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      {#if team.cycles.length === 0}
        <p class="hint" id="{id('cycleId')}-hint">{$t('meet.rule.nocycles')}</p>
      {/if}
      {@render err('cycleId', $t('meet.rule.cycle'))}
    </div>
    <div class="field">
      <label for={id('milestoneId')}>{$t('meet.rule.milestone')}</label>
      <select
        id={id('milestoneId')}
        data-field="rule.milestoneId"
        bind:value={draft.milestoneId}
        aria-invalid={invalid('milestoneId')}
        aria-describedby={describe('milestoneId')}
      >
        {#if milestones.length === 0}<option value="">{$t('meet.option.none')}</option>{/if}
        {#each milestones as m (m.id)}
          <option value={m.id}>{m.name}</option>
        {/each}
      </select>
      {@render err('milestoneId', $t('meet.rule.milestone'))}
    </div>
    <div class="field">
      <label for={id('offsetDays')}>{$t('meet.rule.offset')}</label>
      <input
        id={id('offsetDays')}
        type="number"
        step="1"
        data-field="rule.offsetDays"
        bind:value={draft.offsetDays}
        aria-invalid={invalid('offsetDays')}
        aria-describedby={describe('offsetDays')}
      />
      {@render err('offsetDays', $t('meet.rule.offset'))}
    </div>
  {:else if draft.type === 'once'}
    <div class="field">
      <label for={id('date')}>{$t('meet.rule.date')}</label>
      <input
        id={id('date')}
        type="date"
        data-field="rule.date"
        bind:value={draft.date}
        aria-invalid={invalid('date')}
        aria-describedby={describe('date')}
      />
      {@render err('date', $t('meet.rule.date'))}
    </div>
  {/if}
</div>

<style>
  .rule {
    display: contents;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .days {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  select,
  input[type='number'],
  input[type='date'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
</style>
