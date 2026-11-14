<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { translate as t } from '../i18n';
  import { emptyWorkspace, type Workspace } from '../core/model';
  import { exampleWorkspace } from '../data/examples';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import FilterBar from './FilterBar.svelte';
  import { autosave } from './state/autosave';
  import { browserFileEnv, createFileService, isActivationError } from './state/files';
  import { pickFile } from './state/picker';
  import { workspace } from './state/workspace';

  /** Only Calendar, Weeks and Load follow the role/person filter; elsewhere it stays hidden.
      It is hidden, not removed, so its choice is kept when the user comes back. */
  let { filters = true }: { filters?: boolean } = $props();

  const { dirty, fileName } = workspace;
  /** Without a team there is nothing to filter or save yet; the start screen leads. */
  const empty = $derived($workspace.teams.length === 0);
  const autosaveOn = autosave.status;

  type Problem = { key: string; params?: Record<string, string | number>; more: number };
  let error = $state<Problem | null>(null);
  let askOpen = $state(false);
  let askResolve: ((choice: Choice) => void) | undefined;
  let hint = $state<string | null>(null);
  let busy = false;

  const files = createFileService(
    browserFileEnv((accept) => pickFile(accept ?? '.json,application/json')),
  );

  function ask(): Promise<Choice> {
    askOpen = true;
    return new Promise((resolve) => {
      askResolve = resolve;
    });
  }
  function choose(choice: Choice) {
    askOpen = false;
    askResolve?.(choice);
    askResolve = undefined;
  }

  /** Runs one file action at a time; a second call while one is in flight is ignored. */
  async function exclusive<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    if (busy) return fallback;
    busy = true;
    hint = null;
    try {
      return await run();
    } finally {
      busy = false;
    }
  }

  /** Set when the unsaved-changes dialog led to a save, which may have used up the user activation. */
  let savedInDialog = false;

  /** True when it is fine to replace the workspace: clean, saved or discarded. */
  async function proceed(): Promise<boolean> {
    if (!get(dirty)) return true;
    const choice = await ask();
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      savedInDialog = await doSave(false);
      return savedInDialog;
    }
    return true;
  }

  async function doSave(as: boolean): Promise<boolean> {
    const snapshot = get(workspace);
    try {
      const name = await (as
        ? files.saveAs(snapshot, get(fileName))
        : files.save(snapshot, get(fileName)));
      if (name === null) return false;
      // Edits made while the picker was open are not in the file: stay dirty then.
      if (get(workspace) === snapshot) workspace.markSaved(name);
      else workspace.setFileName(name);
      error = null;
      return true;
    } catch {
      error = { key: 'file.error.write', more: 0 };
      return false;
    }
  }

  /** Saves to the current file; true only when a file was written. */
  export function save(): Promise<boolean> {
    return exclusive(() => doSave(false), false);
  }

  export function saveAs(): Promise<boolean> {
    return exclusive(() => doSave(true), false);
  }

  export function open(): Promise<void> {
    return exclusive(async () => {
      hint = null;
      savedInDialog = false;
      if (!(await proceed())) return;
      let result;
      try {
        result = await files.open();
      } catch (e) {
        if (savedInDialog && isActivationError(e)) hint = 'file.savedOpenAgain';
        else error = { key: 'file.error.read', more: 0 };
        return;
      }
      if (result === null) return;
      if (!result.ok) {
        const [first, ...rest] = result.errors;
        error = { key: first!.key, params: { path: first!.path }, more: rest.length };
        return;
      }
      error = null;
      workspace.replace(result.value.ws, { fileName: result.value.name, dirty: false });
    }, undefined);
  }

  // ---------- narrow screens: Save stays, New, Open and Save as fold into a menu ----------

  const uid = $props.id();
  let moreOpen = $state(false);
  let moreToggle: HTMLButtonElement | undefined = $state();
  let morePanel: HTMLDivElement | undefined = $state();

  // The menu belongs to narrow screens: turning a phone to a wide layout closes it.
  onMount(() => {
    const narrow = window.matchMedia('(max-width: 40rem)');
    const close = () => {
      if (!narrow.matches) moreOpen = false;
    };
    narrow.addEventListener('change', close);
    return () => narrow.removeEventListener('change', close);
  });

  async function toggleMore() {
    moreOpen = !moreOpen;
    if (!moreOpen) return;
    await tick();
    morePanel?.querySelector('button')?.focus();
  }

  /** Closes the menu, gives focus back to its button and runs the action. */
  function fromMore(action: () => Promise<unknown>) {
    moreOpen = false;
    moreToggle?.focus();
    void action();
  }

  function onMoreKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !moreOpen) return;
    event.stopPropagation();
    moreOpen = false;
    moreToggle?.focus();
  }

  function onMoreFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && !morePanel?.contains(next) && !moreToggle?.contains(next)) moreOpen = false;
  }

  function onWindowPointer(event: PointerEvent) {
    if (!moreOpen) return;
    const target = event.target as Node;
    if (!morePanel?.contains(target) && !moreToggle?.contains(target)) moreOpen = false;
  }

  async function replaceWith(make: () => Workspace) {
    if (!(await proceed())) return;
    error = null;
    files.forget();
    const ws = make();
    ws.settings.locale = get(workspace).settings.locale;
    workspace.replace(ws, { fileName: null, dirty: false });
  }

  export function newWorkspace(): Promise<void> {
    return exclusive(
      () => replaceWith(() => emptyWorkspace(new Date().toLocaleDateString('sv-SE'))),
      undefined,
    );
  }

  export function openExample(): Promise<void> {
    return exclusive(
      () => replaceWith(() => exampleWorkspace(get(workspace).settings.locale)),
      undefined,
    );
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<header class="bar">
  <div class="buttons wide">
    <button type="button" class="new" onclick={newWorkspace}>{$t('file.new')}</button>
    <button type="button" class="open" onclick={open}>{$t('file.open')}</button>
    <button type="button" class="save" class:primary={$dirty} onclick={save}
      >{$t('file.save')}</button
    >
    <button type="button" class="save-as" onclick={saveAs}>{$t('file.saveAs')}</button>
  </div>
  <!-- Only one of the two button groups shows; the hidden one is out of the tab order. -->
  <!-- svelte-ignore a11y_no_static_element_interactions (Escape and focus leaving close the menu) -->
  <div class="buttons compact" onkeydown={onMoreKeydown} onfocusout={onMoreFocusout}>
    <button type="button" class="save" class:primary={$dirty} onclick={save}
      >{$t('file.save')}</button
    >
    <button
      type="button"
      class="more"
      aria-label={$t('file.more')}
      aria-expanded={moreOpen}
      aria-controls="{uid}-more"
      bind:this={moreToggle}
      onclick={toggleMore}
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle
          cx="19"
          cy="12"
          r="1.6"
        /></svg
      ></button
    >
    <div class="more-panel" id="{uid}-more" hidden={!moreOpen} bind:this={morePanel}>
      <button type="button" class="new" onclick={() => fromMore(newWorkspace)}
        >{$t('file.new')}</button
      >
      <button type="button" class="open" onclick={() => fromMore(open)}>{$t('file.open')}</button>
      <button type="button" class="save-as" onclick={() => fromMore(saveAs)}
        >{$t('file.saveAs')}</button
      >
    </div>
  </div>
  <p class="status">
    <span class="name">{$fileName ?? $t('file.untitled')}</span>
    {#if $dirty}
      <span class="marker"
        ><span class="full">{$t('file.unsaved')}</span><span class="short"
          >{$t('file.unsaved.short')}</span
        ></span
      >
    {:else if $fileName !== null}
      <span class="marker saved">{$t('file.saved')}</span>
    {/if}
  </p>
  <div role="status" class="notice">
    {#if hint}{$t(hint)}{:else if !$autosaveOn}{$t('file.autosaveOff')}{/if}
  </div>
  <div role="alert" class="error">
    {#if error}
      {@const message = $t(error.key, error.params)}
      {error.more > 0 ? $t('file.error.more', { message, count: error.more }) : message}
    {/if}
  </div>
</header>

{#if !empty}
  <div class="bar context" class:off={!filters}>
    <FilterBar />
  </div>
{/if}

<ConfirmDialog
  open={askOpen}
  title={$t('dialog.unsaved.title')}
  message={$t('dialog.unsaved.message')}
  onchoose={choose}
/>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.5rem var(--space);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .context {
    gap: 0.75rem 2rem;
  }
  .context.off {
    display: none !important;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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
  p {
    margin: 0;
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .marker,
  .notice {
    color: var(--text-muted);
  }
  .error {
    flex-basis: 100%;
    color: var(--text);
    font-weight: 600;
  }
  .error:not(:empty) {
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    background: var(--bg);
  }
  .error:not(:empty)::before {
    content: '⚠ ';
  }
</style>
