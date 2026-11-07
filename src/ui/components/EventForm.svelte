<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { CalEvent, Category, Role, Team } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { localToday } from '../state/workspace';
  import { RULE_TYPES, ruleDraft, toRule, type RuleDraft } from '../meetings/rules';
  import RuleFields from './RuleFields.svelte';

  let {
    event,
    team,
    categories,
    roles,
    save,
    cancel,
  }: {
    /** The event to edit; an empty `id` is a new event. */
    event: CalEvent;
    team: Team;
    categories: Category[];
    roles: Role[];
    /** Commits the event. Returns null on success, else error i18n keys by field path ('' = general). */
    save: (event: CalEvent, commit: boolean) => Record<string, string> | null;
    cancel: () => void;
  } = $props();

  const uid = $props.id();
  const id = (field: string) => `${uid}-${field.replace(/\./g, '-')}`;

  interface Draft {
    name: string;
    categoryId: string;
    rule: RuleDraft;
    time: string;
    duration: number | null;
    scaled: boolean;
    base: number | null;
    perUnit: number | null;
    assumption: string;
    grid: number | null;
    participants: { roleId: string; share: number | null }[];
    /** Percent, 0 to 100. */
    preparation: number | null;
  }

  function init(e: CalEvent): Draft {
    const s = e.scaling;
    return {
      name: e.name,
      categoryId: e.categoryId,
      rule: ruleDraft(e.rule, team, localToday()),
      time: e.time,
      duration: e.duration,
      scaled: s !== undefined,
      base: s?.base ?? 30,
      perUnit: s?.perUnit ?? 5,
      assumption: s?.assumption ?? Object.keys(team.assumptions)[0] ?? '',
      grid: s?.grid ?? 5,
      participants: e.participants.map((p) => ({ ...p })),
      preparation: Math.round(e.preparation * 10000) / 100,
    };
  }

  // The form edits a copy; the parent closes it (and so drops the copy) on any foreign change.
  let draft = $state<Draft>(untrack(() => init(event)));
  const heading = $derived(
    untrack(() => event.id) === ''
      ? $t('meet.form.new')
      : $t('meet.form.edit', { name: untrack(() => event.name) }),
  );
  let errors = $state<Record<string, string>>({});
  let form: HTMLFormElement | undefined;
  let nameInput: HTMLInputElement | undefined;

  onMount(() => nameInput?.focus());

  const assumptionKeys = $derived(Object.keys(team.assumptions));
  /** The event scales by an assumption the team no longer has. */
  const staleAssumption = $derived(
    draft.assumption !== '' && !assumptionKeys.includes(draft.assumption),
  );
  const roleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? roleId;

  const invalid = (field: string) => (errors[field] ? 'true' : undefined);
  const describe = (field: string, extra?: string) =>
    [errors[field] ? `${id(field)}-err` : undefined, extra].filter(Boolean).join(' ') || undefined;

  /** Editing a field makes its error stale (the rule type clears all rule errors). */
  function onEdit(e: Event) {
    const field = (e.target as HTMLElement).dataset.field;
    if (!field) return;
    const drop = (k: string) => (field === 'rule.type' ? k.startsWith('rule.') : k === field);
    if (Object.keys(errors).some(drop)) {
      errors = Object.fromEntries(Object.entries(errors).filter(([k]) => !drop(k)));
    }
  }

  /** Every row whose role is listed more than once. */
  function dupErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    draft.participants.forEach((p, i) => {
      if (draft.participants.some((o, j) => j !== i && o.roleId === p.roleId))
        out[`participants.${i}.roleId`] = 'meet.participants.duplicate';
    });
    return out;
  }

  /** Rows were added or removed: indices shifted, so drop the row errors and re-mark duplicates. */
  function clearParticipantErrors() {
    errors = {
      ...Object.fromEntries(Object.entries(errors).filter(([k]) => !k.startsWith('participants.'))),
      ...dupErrors(),
    };
  }

  function addParticipant() {
    const free = roles.find((r) => !draft.participants.some((p) => p.roleId === r.id));
    if (!free) return;
    draft.participants.push({ roleId: free.id, share: 1 });
    clearParticipantErrors();
  }

  function removeParticipant(i: number) {
    draft.participants.splice(i, 1);
    clearParticipantErrors();
  }

  function onChange(e: Event) {
    onEdit(e);
    const m = /^participants\.(\d+)\.roleId$/.exec((e.target as HTMLElement).dataset.field ?? '');
    if (m) onRole();
  }

  /** A role changed: duplicate marks on every row are recomputed (both rows clear together). */
  function onRole() {
    errors = {
      ...Object.fromEntries(
        Object.entries(errors).filter(
          ([k, v]) => !(k.startsWith('participants.') && v === 'meet.participants.duplicate'),
        ),
      ),
      ...dupErrors(),
    };
  }

  const n = (v: number | null): number => v ?? Number.NaN;

  function build(): CalEvent {
    const d = draft;
    const out: CalEvent = {
      id: event.id,
      name: d.name.trim(),
      categoryId: d.categoryId,
      rule: toRule(d.rule),
      time: d.time.trim(),
      duration: n(d.duration),
      participants: d.participants.map((p) => ({ roleId: p.roleId, share: n(p.share) })),
      preparation: Number.isNaN(n(d.preparation))
        ? Number.NaN
        : Number((n(d.preparation) / 100).toFixed(4)),
    };
    if (d.scaled)
      out.scaling = {
        base: n(d.base),
        perUnit: n(d.perUnit),
        assumption: d.assumption,
        grid: n(d.grid),
      };
    return out;
  }

  async function submit(e: Event) {
    e.preventDefault();
    const found = dupErrors();
    if (draft.scaled && staleAssumption) found['scaling.assumption'] = 'error.ref.unknown';
    // A refused field is never committed, but the other fields are still checked.
    const result = save(build(), Object.keys(found).length === 0);
    if (result === null && Object.keys(found).length === 0) return;
    errors = { ...result, ...found };
    await tick();
    // A weekday group has no aria-invalid (it is a fieldset), so its first checkbox takes the focus.
    const first = form?.querySelector<HTMLElement>(
      '[aria-invalid="true"], fieldset[aria-describedby] input',
    );
    (first ?? form?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    e.preventDefault();
    cancel();
  }
</script>

{#snippet err(field: string, label: string)}
  {#if errors[field]}
    <p class="field-error" id="{id(field)}-err">{$t(errors[field]!, { path: label })}</p>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="eventform" aria-labelledby="{uid}-h" onkeydown={onKeydown}>
  <h3 id="{uid}-h">{heading}</h3>
  <form bind:this={form} novalidate onsubmit={submit} oninput={onEdit} onchange={onChange}>
    {#if errors['']}
      <p class="field-error" role="alert" tabindex="-1">{$t(errors[''], { path: heading })}</p>
    {/if}
    <div class="row">
      <div class="field grow">
        <label for={id('name')}>{$t('meet.name')}</label>
        <input
          id={id('name')}
          type="text"
          data-field="name"
          bind:this={nameInput}
          bind:value={draft.name}
          aria-invalid={invalid('name')}
          aria-describedby={describe('name')}
        />
        {@render err('name', $t('meet.name'))}
      </div>
      <div class="field">
        <label for={id('categoryId')}>{$t('meet.category')}</label>
        <select
          id={id('categoryId')}
          data-field="categoryId"
          bind:value={draft.categoryId}
          aria-invalid={invalid('categoryId')}
          aria-describedby={describe('categoryId')}
        >
          {#each categories as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
        {@render err('categoryId', $t('meet.category'))}
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label for={id('rule.type')}>{$t('meet.ruletype')}</label>
        <select
          id={id('rule.type')}
          data-field="rule.type"
          bind:value={draft.rule.type}
          aria-invalid={invalid('rule.type')}
          aria-describedby={describe('rule.type')}
        >
          {#each RULE_TYPES as r (r)}
            <option value={r}>{$t(`meet.ruletype.${r}`)}</option>
          {/each}
        </select>
        {@render err('rule.type', $t('meet.ruletype'))}
      </div>
      <RuleFields bind:draft={draft.rule} {team} {errors} idPrefix={uid} />
    </div>

    <div class="row">
      <div class="field">
        <label for={id('time')}>{$t('meet.time')}</label>
        <input
          id={id('time')}
          type="text"
          inputmode="numeric"
          autocomplete="off"
          data-field="time"
          bind:value={draft.time}
          aria-invalid={invalid('time')}
          aria-describedby={describe('time')}
        />
        {@render err('time', $t('meet.time'))}
      </div>
      <div class="field">
        <label for={id('duration')}>{$t('meet.duration')}</label>
        <input
          id={id('duration')}
          type="number"
          min="1"
          step="1"
          data-field="duration"
          bind:value={draft.duration}
          aria-invalid={invalid('duration')}
          aria-describedby={describe('duration')}
        />
        {@render err('duration', $t('meet.duration'))}
      </div>
      <div class="field">
        <label for={id('preparation')}>{$t('meet.prep')}</label>
        <input
          id={id('preparation')}
          type="number"
          min="0"
          max="100"
          step="5"
          data-field="preparation"
          bind:value={draft.preparation}
          aria-invalid={invalid('preparation')}
          aria-describedby={describe('preparation', `${id('preparation')}-hint`)}
        />
        <p class="hint" id="{id('preparation')}-hint">{$t('meet.prep.hint')}</p>
        {@render err('preparation', $t('meet.prep'))}
      </div>
    </div>

    <fieldset>
      <legend>{$t('meet.scaling')}</legend>
      <label class="check">
        <input type="checkbox" data-field="scaling" bind:checked={draft.scaled} />
        <span>{$t('meet.scaling.enable')}</span>
      </label>
      {#if draft.scaled}
        <div class="row">
          <div class="field">
            <label for={id('scaling.base')}>{$t('meet.scaling.base')}</label>
            <input
              id={id('scaling.base')}
              type="number"
              min="0"
              step="1"
              data-field="scaling.base"
              bind:value={draft.base}
              aria-invalid={invalid('scaling.base')}
              aria-describedby={describe('scaling.base')}
            />
            {@render err('scaling.base', $t('meet.scaling.base'))}
          </div>
          <div class="field">
            <label for={id('scaling.perUnit')}>{$t('meet.scaling.perUnit')}</label>
            <input
              id={id('scaling.perUnit')}
              type="number"
              min="0"
              step="any"
              data-field="scaling.perUnit"
              bind:value={draft.perUnit}
              aria-invalid={invalid('scaling.perUnit')}
              aria-describedby={describe('scaling.perUnit')}
            />
            {@render err('scaling.perUnit', $t('meet.scaling.perUnit'))}
          </div>
          <div class="field">
            <label for={id('scaling.assumption')}>{$t('meet.scaling.assumption')}</label>
            <select
              id={id('scaling.assumption')}
              data-field="scaling.assumption"
              bind:value={draft.assumption}
              aria-invalid={invalid('scaling.assumption')}
              aria-describedby={describe(
                'scaling.assumption',
                assumptionKeys.length === 0 ? `${id('scaling.assumption')}-hint` : undefined,
              )}
            >
              {#if assumptionKeys.length === 0 || staleAssumption}<option value=""
                  >{$t('meet.option.none')}</option
                >{/if}
              {#each assumptionKeys as k (k)}
                <option value={k}>{k}</option>
              {/each}
            </select>
            {#if assumptionKeys.length === 0}
              <p class="hint" id="{id('scaling.assumption')}-hint">{$t('meet.scaling.none')}</p>
            {/if}
            {@render err('scaling.assumption', $t('meet.scaling.assumption'))}
          </div>
          <div class="field">
            <label for={id('scaling.grid')}>{$t('meet.scaling.grid')}</label>
            <input
              id={id('scaling.grid')}
              type="number"
              min="1"
              step="any"
              data-field="scaling.grid"
              bind:value={draft.grid}
              aria-invalid={invalid('scaling.grid')}
              aria-describedby={describe('scaling.grid')}
            />
            {@render err('scaling.grid', $t('meet.scaling.grid'))}
          </div>
        </div>
      {/if}
    </fieldset>

    <fieldset>
      <legend>{$t('meet.participants')}</legend>
      <p class="hint" id="{uid}-share-hint">{$t('meet.participants.hint')}</p>
      {#if roles.length === 0}
        <p class="hint">{$t('meet.participants.noroles')}</p>
      {:else if draft.participants.length === 0}
        <p class="hint">{$t('meet.participants.empty')}</p>
      {/if}
      {#each draft.participants as p, i (i)}
        <div class="row">
          <div class="field">
            <label for={id(`participants.${i}.roleId`)}>{$t('meet.participants.role')}</label>
            <select
              id={id(`participants.${i}.roleId`)}
              data-field="participants.{i}.roleId"
              bind:value={p.roleId}
              aria-invalid={invalid(`participants.${i}.roleId`)}
              aria-describedby={describe(`participants.${i}.roleId`)}
            >
              {#each roles as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
            {@render err(`participants.${i}.roleId`, $t('meet.participants.role'))}
          </div>
          <div class="field">
            <label for={id(`participants.${i}.share`)}>{$t('meet.participants.share')}</label>
            <input
              id={id(`participants.${i}.share`)}
              type="number"
              min="0"
              max="1"
              step="0.05"
              data-field="participants.{i}.share"
              bind:value={p.share}
              aria-invalid={invalid(`participants.${i}.share`)}
              aria-describedby={describe(`participants.${i}.share`, `${uid}-share-hint`)}
            />
            {@render err(`participants.${i}.share`, $t('meet.participants.share'))}
          </div>
          <button
            type="button"
            aria-label={$t('meet.participants.remove', { role: roleName(p.roleId) })}
            onclick={() => removeParticipant(i)}><span aria-hidden="true">✕</span></button
          >
        </div>
      {/each}
      <button
        type="button"
        disabled={roles.length === 0 || draft.participants.length >= roles.length}
        onclick={addParticipant}>{$t('meet.participants.add')}</button
      >
    </fieldset>

    <div class="actions">
      <button type="submit" class="primary">{$t('meet.save')}</button>
      <button type="button" onclick={cancel}>{$t('meet.cancel')}</button>
    </div>
  </form>
</section>

<style>
  .eventform {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space);
    margin-block: var(--space);
  }
  h3 {
    margin-top: 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 1rem;
    margin-block: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .grow {
    flex: 1 1 14rem;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0.75rem 0;
    padding: 0.5rem var(--space) var(--space);
    min-width: 0;
  }
  legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: var(--space);
  }
  select,
  input[type='number'],
  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
