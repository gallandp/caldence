<script lang="ts">
  import { tick } from 'svelte';
  import { addTeam, duplicateTeam, removeTeam, updateTeam } from '../core/edit';
  import { initials as nameInitials } from './avatar';
  import { translate as t } from '../i18n';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import { activeTeamId, localToday, workspace } from './state/workspace';

  /** Opens the setup wizard; it lives outside the bar so the bar's styles stay out of it. */
  let { onPlan }: { onPlan?: () => void } = $props();
  const uid = $props.id();

  const teams = $derived($workspace.teams);
  const active = $derived(teams.find((x) => x.id === $activeTeamId));

  let dialog: HTMLDialogElement | undefined;
  let mode = $state<'add' | 'rename'>('add');
  let name = $state('');
  let error = $state('');
  let confirming = $state(false);

  /** The team actions are a disclosure: a button that shows or hides a short list. */
  let menuOpen = $state(false);
  let toggle: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();

  const initials = $derived(nameInitials(active?.name ?? ''));

  /** Focus goes back to the toggle first, so a dialog the action opens returns focus there. */
  function run(action: () => void) {
    toggle?.focus();
    menuOpen = false;
    action();
  }

  function onMenuFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && !menu?.contains(next) && !toggle?.contains(next)) menuOpen = false;
  }

  function onMenuKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    menuOpen = false;
    toggle?.focus();
  }

  function onWindowPointer(event: PointerEvent) {
    if (!menuOpen) return;
    const target = event.target as Node;
    if (!menu?.contains(target) && !toggle?.contains(target)) menuOpen = false;
  }

  async function openMenu() {
    menuOpen = !menuOpen;
    if (!menuOpen) return;
    await tick();
    menu?.querySelector('button')?.focus();
  }

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
      const result = workspace.apply((ws) => addTeam(ws, value, localToday()));
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
    // Without teams the Calendar shows the start screen and this bar is gone; fall back to the main area.
    (toggle ?? document.getElementById(`${uid}-add`) ?? document.getElementById('main'))?.focus();
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="switcher">
  {#if active}
    <span class="avatar" aria-hidden="true">{initials}</span>
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
      <span class="meta">
        {$t('team.switcher.meta', {
          kind: $t('team.cadence.kind.' + active.cadence.kind),
          weeks: active.cadence.lengthWeeks,
        })}
      </span>
    </div>
    <button
      type="button"
      class="toggle"
      bind:this={toggle}
      aria-expanded={menuOpen}
      aria-controls="{uid}-menu"
      aria-label={$t('team.actions')}
      onclick={openMenu}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
    </button>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="menu"
      id="{uid}-menu"
      bind:this={menu}
      hidden={!menuOpen}
      onkeydown={onMenuKeydown}
      onfocusout={onMenuFocusout}
    >
      <button type="button" onclick={() => run(() => onPlan?.())}>{$t('setup.another')}</button>
      <button type="button" id="{uid}-add" onclick={() => run(() => openDialog('add'))}
        >{$t('team.add')}</button
      >
      <hr />
      <button type="button" onclick={() => run(() => openDialog('rename'))}
        >{$t('team.rename')}</button
      >
      <button type="button" onclick={() => run(duplicate)}>{$t('team.duplicate')}</button>
      <hr />
      <button type="button" class="danger" onclick={() => run(() => (confirming = true))}
        >{$t('team.delete')}</button
      >
    </div>
  {:else}
    <p class="none">{$t('team.switcher.none')}</p>
    <button type="button" class="add" id="{uid}-add" onclick={() => openDialog('add')}
      >{$t('team.add')}</button
    >
  {/if}
</div>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  onclose={() => {
    dialog?.querySelector('form')?.reset();
    // The menu button that opened the dialog is hidden again; give focus to its toggle.
    // The close event can come late: a menu the user opened since then keeps its focus.
    const focused = document.activeElement;
    if (
      !focused ||
      focused === document.body ||
      dialog?.contains(focused) ||
      (!menuOpen && menu?.contains(focused))
    )
      (toggle ?? document.getElementById(`${uid}-add`))?.focus();
  }}
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
  /* Lives on the dark sidebar. */
  .switcher {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.35rem 0.5rem 0.5rem;
    border-radius: 0.85rem;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, #8b7bff, #22c3ee);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 750;
  }
  .switcher .field {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .switcher label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  :global(#app) .switcher select {
    width: 100%;
    /* The shared select style reserves room for its chevron with !important. */
    padding: 0 1.1rem 0 0 !important;
    border: 0;
    background-color: transparent;
    background-position: right 0.1rem center;
    box-shadow: none;
    color: #fff;
    font-size: 0.95rem;
    font-weight: 650;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  :global(#app) .switcher option {
    color: #000;
  }
  dialog .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--side-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(#app) .switcher button.toggle {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    box-shadow: none;
    color: var(--side-text);
  }
  :global(#app) .switcher button.toggle:hover,
  :global(#app) .switcher button.toggle[aria-expanded='true'] {
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
  }
  /* In the flow, not over the views below: a half-covered view tab is hard to hit. */
  .menu {
    flex-basis: 100%;
    margin: 0.15rem -0.2rem 0 -0.35rem;
    display: flex;
    flex-direction: column;
    padding: 0.35rem;
    border-radius: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .menu[hidden] {
    display: none;
  }
  :global(#app) .switcher .menu button {
    justify-content: flex-start;
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-weight: 500;
    text-align: start;
  }
  :global(#app) .switcher .menu button:hover {
    background: var(--surface-2);
  }
  :global(#app) .switcher .menu button.danger {
    color: var(--danger);
  }
  :global(#app) .switcher .menu button.danger:hover {
    background: var(--danger-soft);
  }
  hr {
    margin: 0.25rem 0.35rem;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .none {
    flex: 1;
    margin: 0;
    font-size: 0.85rem;
    color: var(--side-text);
  }
  :global(#app) .switcher button.add {
    padding: 0.35rem 0.7rem;
    background: rgb(255 255 255 / 0.1);
    border-color: rgb(255 255 255 / 0.25);
    color: #fff;
    font-size: 0.85rem;
  }
  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
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
