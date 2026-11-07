<script lang="ts">
  import { get } from 'svelte/store';
  import { translate as t } from '../i18n';
  import { emptyWorkspace, type Workspace } from '../core/model';
  import { exampleWorkspace } from '../data/examples';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import { autosave } from './state/autosave';
  import { browserFileEnv, createFileService } from './state/files';
  import { workspace } from './state/workspace';

  const { dirty, fileName } = workspace;
  const autosaveOn = autosave.status;

  let input: HTMLInputElement | undefined;
  let pendingFile: ((file: File | null) => void) | undefined;
  let error = $state<string | null>(null);
  let askOpen = $state(false);
  let askResolve: ((choice: Choice) => void) | undefined;

  const files = createFileService(
    browserFileEnv(
      () =>
        new Promise((resolve) => {
          pendingFile = resolve;
          if (input) input.value = '';
          input?.click();
        }),
    ),
  );

  function onFileChange() {
    pendingFile?.(input?.files?.[0] ?? null);
    pendingFile = undefined;
  }
  function onFileCancel() {
    pendingFile?.(null);
    pendingFile = undefined;
  }

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

  /** True when it is fine to replace the workspace: clean, saved or discarded. */
  async function proceed(): Promise<boolean> {
    if (!get(dirty)) return true;
    const choice = await ask();
    if (choice === 'cancel') return false;
    if (choice === 'save') return save();
    return true;
  }

  /** Saves to the current file; true only when a file was written. */
  export async function save(): Promise<boolean> {
    return write(() => files.save(get(workspace), get(fileName)));
  }

  export async function saveAs(): Promise<boolean> {
    return write(() => files.saveAs(get(workspace), get(fileName)));
  }

  async function write(run: () => Promise<string | null>): Promise<boolean> {
    try {
      const name = await run();
      if (name === null) return false;
      workspace.markSaved(name);
      error = null;
      return true;
    } catch {
      error = $t('file.error.write');
      return false;
    }
  }

  export async function open(): Promise<void> {
    if (!(await proceed())) return;
    let result;
    try {
      result = await files.open();
    } catch {
      error = $t('file.error.read');
      return;
    }
    if (result === null) return;
    if (!result.ok) {
      const [first, ...rest] = result.errors;
      const message = $t(first!.key, { path: first!.path });
      error = rest.length > 0 ? $t('file.error.more', { message, count: rest.length }) : message;
      return;
    }
    error = null;
    workspace.replace(result.value.ws, { fileName: result.value.name, dirty: false });
  }

  async function replaceWith(ws: Workspace) {
    if (!(await proceed())) return;
    error = null;
    workspace.replace(ws, { fileName: null, dirty: false });
  }

  export async function newWorkspace(): Promise<void> {
    const ws = emptyWorkspace(new Date().toLocaleDateString('sv-SE'));
    ws.settings.locale = get(workspace).settings.locale;
    await replaceWith(ws);
  }

  export async function openExample(): Promise<void> {
    await replaceWith(exampleWorkspace());
  }
</script>

<div class="bar">
  <div class="buttons">
    <button type="button" onclick={newWorkspace}>{$t('file.new')}</button>
    <button type="button" onclick={open}>{$t('file.open')}</button>
    <button type="button" onclick={save}>{$t('file.save')}</button>
    <button type="button" onclick={saveAs}>{$t('file.saveAs')}</button>
  </div>
  <p class="status">
    <span class="name">{$fileName ?? $t('file.untitled')}</span>
    <span class="marker">{$dirty ? $t('file.unsaved') : $t('file.saved')}</span>
  </p>
  {#if !$autosaveOn}
    <p class="notice">{$t('file.autosaveOff')}</p>
  {/if}
  <div role="alert" class="error">
    {#if error}{error}{/if}
  </div>
</div>

<input
  bind:this={input}
  type="file"
  accept=".json,application/json"
  aria-label={$t('file.input')}
  tabindex="-1"
  hidden
  onchange={onFileChange}
  oncancel={onFileCancel}
/>

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
