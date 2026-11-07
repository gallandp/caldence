<script lang="ts">
  import { translate as t } from '../../i18n';

  let {
    open,
    name,
    options,
    onreplace,
    oncancel,
  }: {
    open: boolean;
    name: string;
    options: { id: string; name: string }[];
    onreplace: (id: string) => void;
    oncancel: () => void;
  } = $props();

  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined;
  let chosen = $state('');

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      chosen = options[0]?.id ?? '';
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  });

  // Escape fires `cancel`; keep the dialog under our control.
  function onCancel(event: Event) {
    event.preventDefault();
    oncancel();
  }
</script>

<dialog bind:this={dialog} oncancel={onCancel} aria-labelledby="{uid}-title">
  <h2 id="{uid}-title">{$t('replace.title', { name })}</h2>
  {#if options.length > 0}
    <p>{$t('replace.message', { name })}</p>
    <label class="field">
      <span>{$t('replace.label')}</span>
      <select bind:value={chosen}>
        {#each options as o (o.id)}
          <option value={o.id}>{o.name}</option>
        {/each}
      </select>
    </label>
  {:else}
    <p>{$t('replace.none', { name })}</p>
  {/if}
  <div class="actions">
    {#if options.length > 0}
      <button type="button" class="primary" onclick={() => onreplace(chosen)}
        >{$t('replace.confirm')}</button
      >
    {/if}
    <button type="button" onclick={oncancel}>{$t('dialog.cancel')}</button>
  </div>
</dialog>

<style>
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
  h2 {
    margin-top: 0;
    font-size: 1.25rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: var(--space);
  }
  select,
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
  }
  select {
    padding: 0.5rem;
  }
  button {
    cursor: pointer;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
