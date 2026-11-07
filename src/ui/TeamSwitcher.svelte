<script lang="ts">
  import { tick } from 'svelte';
  import { addTeam, duplicateTeam, removeTeam, updateTeam } from '../core/edit';
  import { translate as t } from '../i18n';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import { activeTeamId, workspace } from './state/workspace';

  const uid = $props.id();

  const teams = $derived($workspace.teams);
  const active = $derived(teams.find((x) => x.id === $activeTeamId));

  let dialog: HTMLDialogElement | undefined;
  let mode = $state<'add' | 'rename'>('add');
  let name = $state('');
  let error = $state('');
  let confirming = $state(false);

  async function openDialog(next: 'add' | 'rename') {
    mode = next;
    name = next === 'rename' ? (active?.name ?? '') : '';
    error = '';
    await tick();
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.select();
  }

  function submit(event: Event) {
    event.preventDefault();
    const value = name.trim();
    if (value === '') {
      error = 'team.error.empty';
      return;
    }
    if (mode === 'add') {
      const result = workspace.apply((ws) =>
        addTeam(ws, value, new Date().toLocaleDateString('sv-SE')),
      );
      if (!result.ok) {
        error = result.errors[0]?.key ?? 'error.type';
        return;
      }
      if (result.id) activeTeamId.set(result.id);
    } else if (active) {
      const id = active.id;
      const result = workspace.apply((ws) => updateTeam(ws, id, { name: value }));
      if (!result.ok) {
        error = result.errors[0]?.key ?? 'error.type';
        return;
      }
    }
    dialog?.close();
  }

  function duplicate() {
    if (!active) return;
    const { id, name: label } = active;
    const result = workspace.apply((ws) => duplicateTeam(ws, id, $t('team.copy', { name: label })));
    if (result.ok && result.id) activeTeamId.set(result.id);
  }

  async function onConfirm(choice: Choice) {
    confirming = false;
    if (choice !== 'save' || !active) return;
    const id = active.id;
    workspace.apply((ws) => removeTeam(ws, id));
    await tick();
    (document.getElementById(`${uid}-select`) ?? document.getElementById(`${uid}-add`))?.focus();
  }
</script>

<div class="switcher">
  {#if active}
    <div class="field">
      <label for="{uid}-select">{$t('team.switcher.label')}</label>
      <select
        id="{uid}-select"
        value={active.id}
        onchange={(e) => activeTeamId.set(e.currentTarget.value)}
      >
        {#each teams as team (team.id)}
          <option value={team.id}>{team.name}</option>
        {/each}
      </select>
    </div>
  {:else}
    <p class="hint">{$t('team.none')}</p>
  {/if}

  <div class="buttons">
    <button type="button" id="{uid}-add" onclick={() => openDialog('add')}>{$t('team.add')}</button>
    {#if active}
      <button type="button" onclick={() => openDialog('rename')}>{$t('team.rename')}</button>
      <button type="button" onclick={duplicate}>{$t('team.duplicate')}</button>
      <button type="button" onclick={() => (confirming = true)}>{$t('team.delete')}</button>
    {/if}
  </div>
</div>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  onclose={() => dialog?.querySelector('form')?.reset()}
>
  <form onsubmit={submit}>
    <h2 id="{uid}-title">{$t(mode === 'add' ? 'team.dialog.add' : 'team.dialog.rename')}</h2>
    <div class="field">
      <label for="{uid}-name">{$t('team.dialog.name')}</label>
      <input
        id="{uid}-name"
        type="text"
        bind:value={name}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${uid}-err` : undefined}
        oninput={() => (error = '')}
      />
      {#if error}
        <p class="field-error" id="{uid}-err">{$t(error, { path: $t('team.dialog.name') })}</p>
      {/if}
    </div>
    <div class="actions">
      <button type="submit" class="primary">{$t('team.dialog.confirm')}</button>
      <button type="button" onclick={() => dialog?.close()}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<ConfirmDialog
  open={confirming}
  title={$t('team.delete.title', { name: active?.name ?? '' })}
  message={$t('team.delete.message')}
  confirmLabel={$t('team.delete')}
  discard={false}
  onchoose={onConfirm}
/>

<style>
  .switcher {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  select,
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
    padding: 0.4rem 0.9rem;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  dialog {
    min-width: min(24rem, calc(100vw - 2 * var(--space)));
    max-width: min(32rem, calc(100vw - 2 * var(--space)));
    padding: calc(var(--space) * 1.5);
    background: var(--bg);
    color: var(--text);
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  h2 {
    margin-top: 0;
    font-size: 1.25rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: var(--space);
  }
</style>
