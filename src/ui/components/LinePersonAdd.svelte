<script lang="ts">
  import { tick } from 'svelte';
  import { addItem } from '../../core/edit';
  import { LIMITS } from '../../core/limits';
  import { updateLinePerson } from '../../core/lineEdit';
  import type { LineUnit, Workspace } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

  /**
   * Adds a person to a line unit (#316): someone of the file who is in no line unit yet, or a new
   * name. Their contract share is set here; skills follow in the person's row.
   */
  let { unit, returnFocus }: { unit: LineUnit; returnFocus?: () => void } = $props();
  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  const NEW = '';
  let personId = $state(NEW);
  let name = $state('');
  let contract = $state<string | number>('1');
  let error = $state('');

  const free = $derived(
    $workspace.people
      .filter((p) => p.lineUnitId === undefined)
      .sort((a, b) => a.name.localeCompare(b.name, $workspace.settings.locale)),
  );

  export async function show() {
    personId = NEW;
    name = '';
    contract = '1';
    error = '';
    await tick();
    dialog?.showModal();
  }

  function submit(event: Event) {
    event.preventDefault();
    const fte = Number(String(contract).replace(',', '.'));
    if (!Number.isFinite(fte) || fte < 0.1 || fte > 1) {
      error = 'line.person.contract.invalid';
      return;
    }
    if (personId === NEW && name.trim() === '') {
      error = 'team.error.empty';
      return;
    }
    const fields = { lineUnitId: unit.id, contractFte: fte === 1 ? null : fte };
    const result = workspace.apply((ws) => {
      let target = personId;
      let next: Workspace = ws;
      if (target === NEW) [next, target] = addItem(ws, 'people', { name: name.trim() });
      return updateLinePerson(next, target, fields);
    });
    if (!result.ok) {
      // The validator's messages name a path in the file, which means nothing here: say
      // what went wrong in words, and keep the details for a bug report.
      console.warn('Adding a person to the line failed', result.errors);
      const first = result.errors[0];
      error =
        first?.key === 'error.list.tooLong' && first.path === 'people'
          ? 'line.person.add.tooMany'
          : 'line.person.add.failed';
      return;
    }
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={() => returnFocus?.()}>
  <form onsubmit={submit}>
    <h2 id="{uid}-title">{$t('line.person.addTo', { name: unit.name })}</h2>
    <div class="field">
      <label for="{uid}-who">{$t('line.col.person')}</label>
      <select id="{uid}-who" bind:value={personId} onchange={() => (error = '')}>
        <option value={NEW}>{$t('line.person.new')}</option>
        {#each free as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <p class="hint">{$t('line.person.who.hint')}</p>
    </div>
    {#if personId === NEW}
      <div class="field">
        <label for="{uid}-name">{$t('line.person.name')}</label>
        <input id="{uid}-name" type="text" bind:value={name} oninput={() => (error = '')} />
      </div>
    {/if}
    <div class="field">
      <label for="{uid}-fte">{$t('line.detail.contract')}</label>
      <input
        id="{uid}-fte"
        type="number"
        min="0.1"
        max="1"
        step="0.05"
        bind:value={contract}
        oninput={() => (error = '')}
      />
    </div>
    {#if error}
      <p class="field-error" role="alert">{$t(error, { max: LIMITS.people })}</p>
    {/if}
    <div class="actions">
      <button type="submit" class="primary">{$t('line.person.addConfirm')}</button>
      <button type="button" onclick={() => dialog?.close()}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<style>
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
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: var(--space);
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
