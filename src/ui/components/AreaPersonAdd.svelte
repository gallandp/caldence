<script lang="ts">
  import { tick } from 'svelte';
  import { addAreaPerson } from '../../core/areaEdit';
  import { addItem, roleByName } from '../../core/edit';
  import { LIMITS } from '../../core/limits';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { PALETTE } from './ColourField.svelte';
  import FieldError from './FieldError.svelte';
  import { Problems } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';

  /** "+ Person" in the area node: a new or existing person with an area role and area hours. */
  let { area, onadded }: { area: Area; onadded: (personId: string) => void } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, clear, describe } = problems;
  const errors = $derived(problems.errors);

  let dialog: HTMLDialogElement | undefined = $state();
  let trigger: HTMLElement | undefined;
  let name = $state('');
  let roleId = $state('');
  let hours = $state<number | null>(null);
  let newRole = $state('');

  /** The select's value for "New role …": a role is created with the person. */
  const NEW = ':new';
  const roles = $derived($workspace.roles);
  const roleChoice = $derived(
    roleId === NEW || roles.some((r) => r.id === roleId) ? roleId : (roles[0]?.id ?? NEW),
  );

  export async function show(from?: HTMLElement) {
    trigger = from;
    name = '';
    hours = null;
    newRole = '';
    if (!roles.some((r) => r.id === roleId)) roleId = roles[0]?.id ?? NEW;
    clear('add');
    clear('role');
    await tick();
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
  }

  async function onRoleChoice(event: Event) {
    roleId = (event.currentTarget as HTMLSelectElement).value;
    clear('role');
    if (roleId !== NEW) return;
    await tick();
    dialog?.querySelector<HTMLInputElement>('[data-new-role]')?.focus();
  }

  function close() {
    dialog?.close();
    trigger?.focus();
  }

  function submit(event: Event) {
    event.preventDefault();
    const value = name.trim();
    if (value === '') return fail('add', 'error.required', $t('area.add.person'));
    const roleNew = newRole.trim();
    clear('role');
    if (roleChoice === NEW && roleNew === '')
      return fail('role', 'error.required', $t('settings.roles.add'));
    if (roleChoice === NEW && roleNew.length > LIMITS.textChars)
      return fail('role', 'error.text.tooLong', $t('settings.roles.add'));
    // A blank field keeps the hours of someone already in the area (a new person: 0 h).
    const h = hours;
    if (h !== null && (!Number.isFinite(h) || h < 0))
      return fail('add', 'error.number.invalid', $t('area.add.hours'));
    const known = $workspace.people.find(
      (p) => p.name.trim().toLowerCase() === value.toLowerCase(),
    );
    let added = known?.id;
    const done = commit('add', $t('area.add.person'), (ws) => {
      let next = ws;
      let id = known?.id;
      if (id === undefined) [next, id] = addItem(next, 'people', { name: value });
      added = id;
      let role = roleChoice;
      if (role === NEW)
        [next, role] = roleByName(next, roleNew, PALETTE[ws.roles.length % PALETTE.length]!.hex);
      return addAreaPerson(next, area.id, id, role, h);
    });
    if (!done || added === undefined) return;
    dialog?.close();
    trigger?.focus();
    onadded(added);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  oncancel={(e) => (e.preventDefault(), close())}
>
  <h2 id="{uid}-title">{$t('area.add.title', { name: area.name })}</h2>
  <form onsubmit={submit}>
    <label>
      {$t('area.add.person')}
      <input
        type="text"
        list="{uid}-people"
        placeholder={$t('team.members.person.placeholder')}
        bind:value={name}
        aria-invalid={errors.add ? true : undefined}
        aria-describedby={describe('add')}
      />
    </label>
    <datalist id="{uid}-people">
      {#each $workspace.people as p (p.id)}<option value={p.name}></option>{/each}
    </datalist>
    <label>
      {$t('area.card.role')}
      <select value={roleChoice} onchange={onRoleChoice}>
        {#each roles as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        <option value={NEW}>{$t('area.role.new')}</option>
      </select>
    </label>
    {#if roleChoice === NEW}
      <label>
        {$t('settings.roles.add')}
        <input
          type="text"
          data-new-role
          placeholder={$t('area.role.placeholder')}
          bind:value={newRole}
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={describe('role')}
        />
      </label>
      <FieldError {problems} id="role" />
    {/if}
    <label>
      {$t('area.add.hours')}
      <input type="number" min="0" step="0.5" bind:value={hours} placeholder="0" />
    </label>
    <p class="help">
      {$t('area.structure.help', {
        areaOnly: $t('area.group.areaOnly'),
        both: $t('area.group.both'),
      })}
    </p>
    <FieldError {problems} id="add" />
    <div class="actions">
      <button type="submit">{$t('area.dialog.add')}</button>
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2 * var(--space)));
    padding: calc(var(--space) * 1.5);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lg);
  }
  h2 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  :global(#app) dialog form > label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .help {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  :global(#app) dialog input[type='number'] {
    width: 7rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
</style>
