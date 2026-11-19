<script lang="ts">
  import { tick } from 'svelte';
  import { removeSkill } from '../../core/line';
  import {
    addSkill,
    addSkillFamily,
    mergeSkill,
    renameSkill,
    renameSkillFamily,
    skillUsage,
  } from '../../core/lineEdit';
  import type { Workspace } from '../../core/model';
  import type { Result } from '../../core/validate';
  import { translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';
  import ConfirmDialog, { type Choice } from './ConfirmDialog.svelte';

  /**
   * Skills per skill family (#316): add, rename, merge two names of the same thing, and delete
   * with a count of who uses it. Skills are plain tags (epic #314), so there are no levels.
   */
  let { returnFocus }: { returnFocus?: () => void } = $props();
  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  let familyId = $state('');
  let newFamily = $state('');
  let newSkill = $state('');
  let error = $state('');
  let deleting = $state<string | null>(null);

  const families = $derived($workspace.skillFamilies ?? []);
  const family = $derived(families.find((f) => f.id === familyId));
  const skills = $derived(($workspace.skills ?? []).filter((s) => s.familyId === familyId));
  const allSkills = $derived($workspace.skills ?? []);
  const nameOf = (id: string) => allSkills.find((s) => s.id === id)?.name ?? id;

  export async function show(prefer?: string) {
    familyId = families.find((f) => f.id === prefer)?.id ?? families[0]?.id ?? '';
    newFamily = '';
    newSkill = '';
    error = '';
    await tick();
    dialog?.showModal();
  }

  function apply(change: (ws: Workspace) => Result<Workspace> | Result<[Workspace, string]>) {
    const result = workspace.apply(change);
    error = result.ok ? '' : (result.errors[0]?.key ?? 'error.type');
    return result;
  }

  function onAddFamily(event: Event) {
    event.preventDefault();
    const result = apply((ws) => addSkillFamily(ws, newFamily));
    if (result.ok && result.id) {
      familyId = result.id;
      newFamily = '';
    }
  }
  function onAddSkill(event: Event) {
    event.preventDefault();
    if (!familyId) return;
    const id = familyId;
    if (apply((ws) => addSkill(ws, id, newSkill)).ok) newSkill = '';
  }
  function onMerge(fromId: string, event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const into = select.value;
    select.value = '';
    if (into) apply((ws) => mergeSkill(ws, fromId, into));
  }
  function onConfirmDelete(choice: Choice) {
    const id = deleting;
    deleting = null;
    if (choice === 'save' && id) apply((ws) => ({ ok: true, value: removeSkill(ws, id) }));
  }
  const usageText = (id: string) => {
    const u = skillUsage($workspace, id);
    return [
      $t(u.people === 1 ? 'org.people.one' : 'org.people.other', { n: u.people }),
      u.demands > 0
        ? $t(u.demands === 1 ? 'line.skills.demands.one' : 'line.skills.demands.other', {
            n: u.demands,
          })
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={() => returnFocus?.()}>
  <h2 id="{uid}-title">{$t('line.skills.title')}</h2>
  <p class="hint">{$t('line.skills.hint')}</p>

  {#if families.length > 0}
    <div class="row">
      <div class="field grow">
        <label for="{uid}-family">{$t('line.skills.family')}</label>
        <select id="{uid}-family" bind:value={familyId} onchange={() => (error = '')}>
          {#each families as f (f.id)}
            <option value={f.id}>{f.name}</option>
          {/each}
        </select>
      </div>
      {#if family}
        <div class="field grow">
          <label for="{uid}-family-name">{$t('line.skills.familyName')}</label>
          <input
            id="{uid}-family-name"
            type="text"
            value={family.name}
            onchange={(e) => {
              const id = family.id;
              const value = (e.currentTarget as HTMLInputElement).value;
              apply((ws) => renameSkillFamily(ws, id, value));
            }}
          />
        </div>
      {/if}
    </div>

    <h3>{$t('line.skills.list', { family: family?.name ?? '' })}</h3>
    {#if skills.length === 0}
      <p class="hint">{$t('line.skills.empty')}</p>
    {:else}
      <ul class="skills">
        {#each skills as s (s.id)}
          <li>
            <input
              type="text"
              value={s.name}
              aria-label={$t('line.skills.rename', { skill: s.name })}
              onchange={(e) => {
                const value = (e.currentTarget as HTMLInputElement).value;
                apply((ws) => renameSkill(ws, s.id, value));
              }}
            />
            <span class="usage">{usageText(s.id)}</span>
            <select
              aria-label={$t('line.skills.merge', { skill: s.name })}
              onchange={(e) => onMerge(s.id, e)}
            >
              <option value="">{$t('line.skills.mergeInto')}</option>
              {#each allSkills.filter((x) => x.id !== s.id) as x (x.id)}
                <option value={x.id}>{x.name}</option>
              {/each}
            </select>
            <button
              type="button"
              class="danger"
              aria-label={$t('line.skills.delete', { skill: s.name })}
              onclick={() => (deleting = s.id)}>{$t('line.skills.deleteShort')}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <form class="row add" onsubmit={onAddSkill}>
      <div class="field grow">
        <label for="{uid}-skill">{$t('line.skills.new')}</label>
        <input id="{uid}-skill" type="text" bind:value={newSkill} />
      </div>
      <button type="submit" class="secondary">{$t('line.skills.addSkill')}</button>
    </form>
  {:else}
    <p class="hint">{$t('line.skills.noFamilies')}</p>
  {/if}

  <form class="row add" onsubmit={onAddFamily}>
    <div class="field grow">
      <label for="{uid}-new-family">{$t('line.skills.newFamily')}</label>
      <input id="{uid}-new-family" type="text" bind:value={newFamily} />
    </div>
    <button type="submit" class="secondary">{$t('line.skills.addFamily')}</button>
  </form>

  {#if error}
    <p class="field-error" role="alert">{$t(error, { path: $t('team.dialog.name') })}</p>
  {/if}
  <div class="actions">
    <button type="button" class="primary" onclick={() => dialog?.close()}
      >{$t('line.skills.done')}</button
    >
  </div>
</dialog>

<ConfirmDialog
  open={deleting !== null}
  title={$t('line.skills.delete.title', { skill: deleting ? nameOf(deleting) : '' })}
  message={deleting ? $t('line.skills.delete.message', { usage: usageText(deleting) }) : ''}
  confirmLabel={$t('line.skills.deleteShort')}
  discard={false}
  onchoose={onConfirmDelete}
/>

<style>
  dialog {
    width: min(40rem, calc(100vw - 2 * var(--space)));
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
  h3 {
    margin: var(--space) 0 0.5rem;
    font-size: 1rem;
  }
  .hint {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.75rem;
  }
  .row.add {
    margin-top: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .grow {
    flex: 1 1 12rem;
  }
  .skills {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
  }
  .skills li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }
  .skills input {
    flex: 1 1 10rem;
    min-width: 0;
  }
  .usage {
    font-size: 0.85rem;
    color: var(--text-muted);
    min-width: 6rem;
  }
  .skills select {
    max-width: 12rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space);
  }
</style>
