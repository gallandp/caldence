<script lang="ts">
  import { tick } from 'svelte';
  import { addLineUnit, updateLineUnit } from '../core/lineEdit';
  import { lineKind, lineTree, parentChoices } from '../core/lineStaff';
  import { lineSelection, type LineKind, type LineUnit } from '../core/model';
  import { levels, translate as t } from '../i18n';
  import { lineLevelWord } from '../i18n/levels';
  import { activeTeamId, workspace } from './state/workspace';

  /**
   * Adds a line unit or changes one (#316): name, level (#399), the unit above it, the line
   * manager and the skill family. A company always sits at the top.
   */
  let { returnFocus }: { returnFocus?: () => void } = $props();
  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  let unit = $state<LineUnit | undefined>();
  let name = $state('');
  let parentId = $state('');
  let kind = $state<LineKind>('team');
  /** The level as shown when the dialog opened: only a level the user changes is stored. */
  let shownKind: LineKind = 'team';
  const KINDS: readonly LineKind[] = ['company', 'group', 'team'];
  let managerId = $state('');
  let familyId = $state('');
  let error = $state('');
  let general = $state('');

  const choices = $derived(parentChoices($workspace, unit?.id));
  const depth = $derived(new Map(lineTree($workspace).map((x) => [x.unit.id, x.depth])));
  const people = $derived(
    [...$workspace.people].sort((a, b) => a.name.localeCompare(b.name, $workspace.settings.locale)),
  );
  const families = $derived($workspace.skillFamilies ?? []);

  /** Opens the dialog for `of`, or to add a unit below `under`. */
  export async function show(of?: LineUnit, under?: string) {
    unit = of;
    name = of?.name ?? '';
    // A unit on the lowest level offers no place below it: then the new one starts at the top.
    const offered = parentChoices($workspace, of?.id).some((u) => u.id === under);
    parentId = of?.parentId ?? (offered ? under! : '');
    // New units and units of older files show their derived level; it is only stored once the
    // user picks another one, so a unit without a stored level can still get units below it.
    kind = of ? (lineKind($workspace, of.id) as LineKind) : 'team';
    shownKind = kind;
    managerId = of?.managerPersonId ?? '';
    familyId =
      of?.skillFamilyId ??
      $workspace.lineUnits?.find((u) => u.id === (of?.parentId ?? under))?.skillFamilyId ??
      '';
    error = '';
    general = '';
    await tick();
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input[type="text"]')?.select();
  }

  function submit(event: Event) {
    event.preventDefault();
    if (name.trim() === '') {
      error = 'team.error.empty';
      return;
    }
    const target = unit;
    const patch = {
      ...(kind !== shownKind || unit?.kind !== undefined ? { kind } : {}),
      // A company always sits at the top (#399).
      parentId: (kind === 'company' ? '' : parentId) || null,
      managerPersonId: managerId || null,
      skillFamilyId: familyId || null,
    };
    let newId: string | undefined;
    const result = workspace.apply((ws) => {
      if (target) return updateLineUnit(ws, target.id, { name, ...patch });
      const added = addLineUnit(ws, name, (kind === 'company' ? '' : parentId) || undefined);
      if (!added.ok) return added;
      const [next, id] = added.value;
      newId = id;
      const done = updateLineUnit(next, id, patch);
      return done.ok ? { ok: true, value: [done.value, id] as [typeof next, string] } : done;
    });
    if (!result.ok) {
      general = result.errors[0]?.key ?? 'error.type';
      return;
    }
    if (newId) activeTeamId.set(lineSelection(newId));
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={() => returnFocus?.()}>
  <form onsubmit={submit}>
    <h2 id="{uid}-title">
      {unit ? $t('line.unit.edit', { name: unit.name }) : $t('line.unit.add')}
    </h2>
    <div class="field">
      <label for="{uid}-name">{$t('line.unit.name')}</label>
      <input
        id="{uid}-name"
        type="text"
        bind:value={name}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${uid}-err` : undefined}
        oninput={() => (error = '')}
      />
      {#if error}
        <p class="field-error" id="{uid}-err">{$t(error, { path: $t('line.unit.name') })}</p>
      {/if}
    </div>
    <div class="field">
      <label for="{uid}-kind">{$t('line.unit.kind')}</label>
      <select
        id="{uid}-kind"
        bind:value={kind}
        aria-describedby={kind === 'company' ? `${uid}-kind-hint` : undefined}
      >
        {#each KINDS as k (k)}
          <option value={k}>{lineLevelWord($levels, k)}</option>
        {/each}
      </select>
      {#if kind === 'company'}
        <p class="hint" id="{uid}-kind-hint">
          {$t('line.unit.company.hint', { name: name.trim() || lineLevelWord($levels, 'company') })}
        </p>
      {/if}
    </div>
    <div class="field">
      <label for="{uid}-parent">{$t('line.unit.parent')}</label>
      <select
        id="{uid}-parent"
        bind:value={parentId}
        disabled={kind === 'company'}
        aria-describedby="{uid}-parent-hint"
      >
        <option value="">{$t('line.unit.top')}</option>
        {#each choices as u (u.id)}
          <option value={u.id}>{'\u00a0'.repeat((depth.get(u.id) ?? 0) * 3)}{u.name}</option>
        {/each}
      </select>
      <p class="hint" id="{uid}-parent-hint">
        {$t('line.unit.parent.hint', { company: $levels.lineCompany, team: $levels.lineTeam })}
      </p>
    </div>
    <div class="field">
      <label for="{uid}-manager">{$t('line.unit.manager')}</label>
      <select id="{uid}-manager" bind:value={managerId}>
        <option value="">{$t('line.unit.noManager')}</option>
        {#each people as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <label for="{uid}-family">{$t('line.unit.family')}</label>
      <select id="{uid}-family" bind:value={familyId}>
        <option value="">{$t('line.unit.noFamily')}</option>
        {#each families as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    </div>
    {#if general}
      <p class="field-error" role="alert">
        {$t(general, { path: name.trim() || $t('line.unit.parent') })}
      </p>
    {/if}
    <div class="actions">
      <button type="submit" class="primary"
        >{$t(unit ? 'team.dialog.confirm' : 'line.unit.create')}</button
      >
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
  input[type='text'],
  select {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
    min-height: 2.5rem;
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
    margin-top: var(--space);
  }
</style>
