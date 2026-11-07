<script lang="ts" module>
  export type Choice = 'save' | 'discard' | 'cancel';
</script>

<script lang="ts">
  import { translate as t } from '../../i18n';

  let {
    open,
    title,
    message,
    onchoose,
    confirmLabel,
    discard = true,
  }: {
    open: boolean;
    title: string;
    message: string;
    onchoose: (choice: Choice) => void;
    /** Replaces the label of the primary ("save") button. */
    confirmLabel?: string;
    /** Set to false to hide the Discard button (a plain confirm/cancel prompt). */
    discard?: boolean;
  } = $props();

  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  // Escape fires `cancel`; keep the dialog under our control and report it as a choice.
  function onCancel(event: Event) {
    event.preventDefault();
    onchoose('cancel');
  }
</script>

<dialog bind:this={dialog} oncancel={onCancel} aria-labelledby="{uid}-title">
  <h2 id="{uid}-title">{title}</h2>
  <p>{message}</p>
  <div class="actions">
    <button type="button" class="primary" onclick={() => onchoose('save')}
      >{confirmLabel ?? $t('dialog.save')}</button
    >
    {#if discard}
      <button type="button" onclick={() => onchoose('discard')}>{$t('dialog.discard')}</button>
    {/if}
    <button type="button" onclick={() => onchoose('cancel')}>{$t('dialog.cancel')}</button>
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
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
</style>
