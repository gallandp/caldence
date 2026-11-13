<script lang="ts" module>
  export interface Row {
    id: string;
    name: string;
  }
  export interface RowContext {
    /** Validation errors of this row, keyed by field name (i18n keys). */
    errors: Record<string, string>;
    /** Commits a patch to this row; false (and an inline error) when the workspace refuses it. */
    update: (patch: Record<string, unknown>) => boolean;
    /** Shows an inline error (an i18n key) on a field of this row without committing. */
    fail: (field: string, key: string) => void;
  }
</script>

<script lang="ts" generics="T extends Row">
  import { onMount, tick, type Snippet } from 'svelte';
  import { moveItem, removeItem, updateItem, addItem, type ListKind } from '../../core/edit';
  import type { Workspace } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { fieldErrors } from '../state/form';
  import { applyOwn } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';
  import ConfirmDialog, { type Choice } from './ConfirmDialog.svelte';
  import ReplaceDialog from './ReplaceDialog.svelte';

  let {
    kind,
    items,
    heading,
    addLabel,
    create,
    extra,
    confirmRemove,
  }: {
    kind: ListKind;
    items: T[];
    heading: string;
    /** Visible label of the "new item" name input. */
    addLabel: string;
    /** Item data (without id) for a new item with this name. */
    create: (name: string) => Record<string, unknown>;
    /** Extra fields of a row (colour, hours, ...). */
    extra?: Snippet<[T, RowContext]>;
    /** A title and message when deleting this item needs a confirmation first. */
    confirmRemove?: (item: T) => { title: string; message: string } | null;
  } = $props();

  const uid = $props.id();
  let root: HTMLElement | undefined;
  let newName = $state('');
  let addError = $state('');
  let rowErrors = $state<Record<string, Record<string, string>>>({});

  // Errors belong to a failed commit of this editor; any other workspace change (undo, open, new)
  // makes them stale.
  let own = false;
  function run<R>(fn: () => R): R {
    own = true;
    try {
      return fn();
    } finally {
      own = false;
    }
  }
  onMount(() =>
    workspace.subscribe(() => {
      if (own) return;
      rowErrors = {};
      addError = '';
    }),
  );

  type Mutable = (
    ws: Workspace,
    kind: ListKind,
    id: string,
    patch: Record<string, unknown>,
  ) => Workspace;

  function update(id: string, patch: Record<string, unknown>): boolean {
    const index = items.findIndex((i) => i.id === id);
    const result = run(() => applyOwn((ws) => (updateItem as Mutable)(ws, kind, id, patch)));
    if (result.ok) {
      rowErrors[id] = {};
      return true;
    }
    rowErrors[id] = fieldErrors(result.errors, `${kind}.${index}`);
    return false;
  }

  function contextFor(item: T, errors: Record<string, string>): RowContext {
    return {
      errors,
      update: (patch) => update(item.id, patch),
      fail: (field, key) => (rowErrors[item.id] = { ...rowErrors[item.id], [field]: key }),
    };
  }

  function rename(item: T, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.value.trim();
    if (name === '') {
      rowErrors[item.id] = { name: 'list.error.empty' };
      return;
    }
    update(item.id, { name });
  }

  async function focusSoon(selector: string, fallback?: string) {
    await tick();
    const el =
      root?.querySelector<HTMLElement>(`${selector}:not(:disabled)`) ??
      (fallback ? root?.querySelector<HTMLElement>(`${fallback}:not(:disabled)`) : null);
    el?.focus();
  }

  function add(event: Event) {
    event.preventDefault();
    const name = newName.trim();
    if (name === '') {
      addError = 'list.error.empty';
      return;
    }
    const result = run(() => applyOwn((ws) => addItem(ws, kind, create(name) as never)));
    if (!result.ok) {
      addError = result.errors[0]?.key ?? 'error.type';
      return;
    }
    addError = '';
    newName = '';
  }

  function move(item: T, delta: -1 | 1) {
    run(() => applyOwn((ws) => moveItem(ws, kind, item.id, delta)));
    const same = delta < 0 ? 'up' : 'down';
    const other = delta < 0 ? 'down' : 'up';
    void focusSoon(`[data-move="${item.id}:${same}"]`, `[data-move="${item.id}:${other}"]`);
  }

  // ---------- deleting ----------

  let confirming = $state<T | null>(null);
  let replacing = $state<T | null>(null);

  function remove(item: T) {
    const needed = confirmRemove?.(item);
    if (needed) confirming = item;
    else tryRemove(item);
  }

  function tryRemove(item: T, replacementId?: string) {
    const index = items.findIndex((i) => i.id === item.id);
    const neighbour = items[index + 1] ?? items[index - 1];
    const result = run(() => applyOwn((ws) => removeItem(ws, kind, item.id, replacementId)));
    if (result.ok) {
      replacing = null;
      void focusSoon(
        neighbour ? `[data-name="${neighbour.id}"]` : `[data-add="${uid}"]`,
        `[data-add="${uid}"]`,
      );
    } else if (result.errors.some((e) => e.key === 'error.ref.inuse')) {
      replacing = item;
    }
  }

  function onConfirm(choice: Choice) {
    const item = confirming;
    confirming = null;
    if (item && choice === 'save') tryRemove(item);
    else if (item) void focusSoon(`[data-delete="${item.id}"]`);
  }

  function cancelReplace() {
    const item = replacing;
    replacing = null;
    if (item) void focusSoon(`[data-delete="${item.id}"]`);
  }
</script>

<section class="list" bind:this={root} aria-labelledby="{uid}-h">
  <h3 id="{uid}-h">{heading}</h3>
  {#if items.length === 0}
    <p class="empty">{$t('list.empty')}</p>
  {:else}
    <ul>
      {#each items as item, i (item.id)}
        {@const errors = rowErrors[item.id] ?? {}}
        <li>
          <div class="fields">
            <div class="name">
              <label class="named">
                <span>{$t('list.name')}</span>
                <input
                  type="text"
                  data-name={item.id}
                  value={item.name}
                  aria-label={$t('list.rename', { name: item.name })}
                  aria-invalid={errors.name ? 'true' : undefined}
                  aria-describedby={errors.name ? `${uid}-${item.id}-err` : undefined}
                  oninput={() => errors.name && (rowErrors[item.id] = {})}
                  onchange={(e) => rename(item, e)}
                />
              </label>
              {#if errors.name}
                <p class="field-error" id="{uid}-{item.id}-err">
                  {$t(errors.name, { path: item.name })}
                </p>
              {/if}
            </div>
            {#if extra}
              {@render extra(item, contextFor(item, errors))}
            {/if}
          </div>
          <div class="buttons">
            <button
              type="button"
              data-move="{item.id}:up"
              disabled={i === 0}
              aria-label={$t('list.up', { name: item.name })}
              onclick={() => move(item, -1)}><span aria-hidden="true">↑</span></button
            >
            <button
              type="button"
              data-move="{item.id}:down"
              disabled={i === items.length - 1}
              aria-label={$t('list.down', { name: item.name })}
              onclick={() => move(item, 1)}><span aria-hidden="true">↓</span></button
            >
            <button
              type="button"
              data-delete={item.id}
              aria-label={$t('list.delete', { name: item.name })}
              onclick={() => remove(item)}><span aria-hidden="true">✕</span></button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="add" onsubmit={add}>
    <div class="name">
      <label for="{uid}-new">{addLabel}</label>
      <input
        id="{uid}-new"
        type="text"
        data-add={uid}
        bind:value={newName}
        aria-invalid={addError ? 'true' : undefined}
        aria-describedby={addError ? `${uid}-new-err` : undefined}
      />
      {#if addError}
        <p class="field-error" id="{uid}-new-err">{$t(addError, { path: addLabel })}</p>
      {/if}
    </div>
    <button type="submit" class="secondary add-button"
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{$t(
        'list.add',
      )}</button
    >
  </form>
</section>

{#if confirming}
  {@const c = confirmRemove?.(confirming)}
  <ConfirmDialog
    open
    title={c?.title ?? ''}
    message={c?.message ?? ''}
    confirmLabel={$t('list.deleteConfirm')}
    discard={false}
    onchoose={onConfirm}
  />
{/if}

<ReplaceDialog
  open={replacing !== null}
  name={replacing?.name ?? ''}
  options={items.filter((i) => i.id !== replacing?.id)}
  onreplace={(id) => replacing && tryRemove(replacing, id)}
  oncancel={cancelReplace}
/>

<style>
  .list {
    margin-block: var(--space);
  }
  h3 {
    margin-bottom: 0.5rem;
  }
  ul {
    list-style: none;
    margin: 0 0 var(--space);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 1rem;
    flex: 1 1 18rem;
  }
  .name {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1 1 12rem;
  }
  .named {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-muted);
  }
  .buttons {
    align-self: flex-end;
    display: flex;
    gap: 0.25rem;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
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
  /* Same outlined "+ Add" button as in the Team view. */
  .add-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .add-button svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .empty {
    color: var(--text-muted);
  }
</style>
