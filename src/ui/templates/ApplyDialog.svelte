<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { applyTemplate, type Template } from '../../core/template';
  import { builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { locale, translate as t } from '../../i18n';
  import { activeTeamId, localToday, workspace } from '../state/workspace';

  /** Called with the team name once the team was created and the dialog is closed. */
  let { oncreated }: { oncreated?: (name: string) => void } = $props();

  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  let input: HTMLInputElement | undefined;
  let target = $state.raw<Template | null>(null);
  let name = $state('');
  let nameError = $state(false);
  let problem = $state<{ key: string; path?: string } | null>(null);

  /** Opens the dialog for a built-in template in the UI language. */
  export function show(id: BuiltinTemplateId) {
    target = builtinTemplate(id, get(locale));
    name = target.name;
    nameError = false;
    problem = null;
    dialog?.showModal();
  }

  function close() {
    dialog?.close();
    target = null;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!target) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      nameError = true;
      input?.focus();
      return;
    }
    const template = target;
    const result = workspace.apply((ws) =>
      applyTemplate(ws, template, { name: trimmed, today: localToday() }),
    );
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      void tick().then(() => input?.focus());
      return;
    }
    if (result.id) activeTeamId.set(result.id);
    oncreated?.(trimmed);
    close();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-dialog-h"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <h2 id="{uid}-dialog-h">{$t('templates.dialog.title', { name: target?.name ?? '' })}</h2>
  <form onsubmit={submit}>
    <div class="field">
      <label for="{uid}-dialog-name">{$t('templates.teamName')}</label>
      <input
        id="{uid}-dialog-name"
        type="text"
        bind:this={input}
        bind:value={name}
        aria-invalid={nameError || problem ? 'true' : undefined}
        aria-describedby={nameError || problem ? `${uid}-dialog-err` : undefined}
        oninput={() => {
          nameError = false;
          problem = null;
        }}
      />
    </div>
    {#if nameError}
      <p class="field-error" id="{uid}-dialog-err">{$t('templates.error.name')}</p>
    {:else if problem}
      <p class="field-error" id="{uid}-dialog-err">
        {$t(problem.key, { path: problem.path ?? '' })}
      </p>
    {/if}
    <div class="actions">
      <button type="submit" class="primary">{$t('templates.create')}</button>
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .field-error {
    margin: 0.25rem 0 0;
    color: var(--danger);
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  input {
    max-width: 100%;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
  }
  dialog {
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
  dialog h2 {
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
