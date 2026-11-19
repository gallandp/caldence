<script lang="ts">
  import { tick } from 'svelte';
  import {
    addTeam,
    duplicateTeam,
    removeArea,
    removeTeam,
    renameArea,
    renameOrganisation,
    updateTeam,
  } from '../core/edit';
  import {
    areaOf,
    hasOrgLevel,
    linePeople,
    lineSelection,
    ORG_UNIT,
    orgName,
    selectedLineUnit,
    type Area,
    type LineUnit,
  } from '../core/model';
  import { removeLineUnit } from '../core/line';
  import { childUnits, isLineGroup } from '../core/lineStaff';
  import LineUnitDialog from './LineUnitDialog.svelte';
  import { LINE_ICON } from './viewIcons';
  import { initials as nameInitials } from './avatar';
  import { levels, translate as t } from '../i18n';
  import AreaDialog from './AreaDialog.svelte';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import { activeTeamId, localToday, workspace } from './state/workspace';

  /** Opens the setup wizard; it lives outside the bar so the bar's styles stay out of it. */
  let { onPlan }: { onPlan?: () => void } = $props();
  const uid = $props.id();

  const teams = $derived($workspace.teams);
  const areas = $derived($workspace.areas);
  /** The selection is a team or an area. */
  const active = $derived(teams.find((x) => x.id === $activeTeamId));
  const activeArea = $derived(areas.find((x) => x.id === $activeTeamId));
  /** The organisation (#313): the top entry once there is something to group. */
  const showOrg = $derived(hasOrgLevel($workspace));
  const activeOrg = $derived(showOrg && $activeTeamId === ORG_UNIT);
  const org = $derived({ id: ORG_UNIT, name: orgName($workspace, $levels.org) });
  /** A line unit (#316): its own group in the list, below the organisation's tree. */
  const lineUnits = $derived($workspace.lineUnits ?? []);
  const activeLine = $derived(lineUnits.find((u) => u.id === selectedLineUnit($activeTeamId)));
  const lineLevel = (u: LineUnit) =>
    isLineGroup($workspace, u.id) ? $levels.lineGroup : $levels.lineTeam;
  const peopleText = (n: number) => $t(n === 1 ? 'org.people.one' : 'org.people.other', { n });
  let lineDialog: LineUnitDialog | undefined = $state();
  const current = $derived(activeLine ?? (activeOrg ? org : (activeArea ?? active)));
  const orgCount = $derived(
    areas.length > 0
      ? $t(areas.length === 1 ? 'org.count.areas.one' : 'org.count.areas.other', {
          n: areas.length,
        })
      : $t(teams.length === 1 ? 'area.count.one' : 'area.count.other', { n: teams.length }),
  );
  const activeAreaOf = $derived(active ? areaOf($workspace, active.id) : undefined);
  const ungrouped = $derived(teams.filter((x) => !areaOf($workspace, x.id)));
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? '';
  const teamCount = (area: Area) =>
    $t(area.teamIds.length === 1 ? 'area.count.one' : 'area.count.other', {
      n: area.teamIds.length,
    });

  let dialog: HTMLDialogElement | undefined;
  let mode = $state<'add' | 'rename' | 'renameArea' | 'renameOrg'>('add');
  let areaDialog: AreaDialog | undefined = $state();
  let name = $state('');
  let error = $state('');
  let confirming = $state(false);

  /** The team actions are a disclosure: a button that shows or hides a short list. */
  let menuOpen = $state(false);
  let toggle: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();

  const initials = $derived(nameInitials(current?.name ?? ''));
  /** Long names are cut after two lines; the tooltip keeps the whole text. */
  const pickTitle = $derived(
    activeLine
      ? `${activeLine.name}\n${lineLevel(activeLine)} · ${peopleText(linePeople($workspace, activeLine.id).size)}`
      : activeOrg
        ? `${org.name}\n${$t('org.meta', { count: orgCount })}`
        : activeArea
          ? `${activeArea.name}\n${$t('area.meta', { count: teamCount(activeArea) })}`
          : active
            ? `${active.name}\n${activeAreaOf ? `${activeAreaOf.name} · ` : ''}${$t(
                'team.switcher.meta',
                {
                  kind: $t('team.cadence.kind.' + active.cadence.kind),
                  weeks: active.cadence.lengthWeeks,
                },
              )}`
            : '',
  );

  /** The list of teams and areas is a disclosure too, in the flow like the menu. */
  let listOpen = $state(false);
  let pick: HTMLButtonElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  async function openList() {
    menuOpen = false;
    listOpen = !listOpen;
    if (!listOpen) return;
    await tick();
    (
      list?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ??
      list?.querySelector<HTMLButtonElement>('button')
    )?.focus();
  }

  function choose(id: string) {
    activeTeamId.set(id);
    listOpen = false;
    pick?.focus();
  }

  /** Arrow keys, Home and End move between the entries; Escape closes the list. */
  function onListKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      listOpen = false;
      pick?.focus();
      return;
    }
    const options = [...(list?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    const last = options.length - 1;
    const target =
      event.key === 'ArrowDown'
        ? Math.min(i + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(i - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    options[target]?.focus();
  }

  function onListFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && !list?.contains(next) && !pick?.contains(next)) listOpen = false;
  }

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
    const target = event.target as Node;
    if (menuOpen && !menu?.contains(target) && !toggle?.contains(target)) menuOpen = false;
    if (listOpen && !list?.contains(target) && !pick?.contains(target)) listOpen = false;
  }

  async function openMenu() {
    listOpen = false;
    menuOpen = !menuOpen;
    if (!menuOpen) return;
    await tick();
    menu?.querySelector('button')?.focus();
  }

  async function openDialog(next: 'add' | 'rename' | 'renameArea' | 'renameOrg') {
    mode = next;
    name =
      next === 'rename'
        ? (active?.name ?? '')
        : next === 'renameArea'
          ? (activeArea?.name ?? '')
          : next === 'renameOrg'
            ? ($workspace.organisation?.name ?? '')
            : '';
    error = '';
    await tick();
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.select();
  }

  const nameLabel = $derived(
    mode === 'renameArea'
      ? 'area.dialog.name'
      : mode === 'renameOrg'
        ? 'org.dialog.name'
        : 'team.dialog.name',
  );

  function submit(event: Event) {
    event.preventDefault();
    const value = name.trim();
    // An empty name gives the organisation its level's name back.
    if (mode === 'renameOrg') {
      const result = workspace.apply((ws) => renameOrganisation(ws, value));
      if (!result.ok) {
        error = result.errors[0]?.key ?? 'error.type';
        return;
      }
      return dialog?.close();
    }
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
    } else if (mode === 'renameArea') {
      if (!activeArea) return dialog?.close();
      const id = activeArea.id;
      const result = workspace.apply((ws) => renameArea(ws, id, value));
      if (!result.ok) {
        error = result.errors[0]?.key ?? 'error.type';
        return;
      }
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

  /** What deleting the area takes with it: its own meetings and people (teams stay). */
  const areaLoss = $derived(
    activeArea
      ? {
          events: activeArea.events.length,
          people: new Set(activeArea.members.map((m) => m.personId)).size,
        }
      : { events: 0, people: 0 },
  );

  async function onConfirm(choice: Choice) {
    confirming = false;
    if (choice !== 'save' || !current) return;
    const id = current.id;
    if (activeLine) {
      const parent = activeLine.parentId;
      workspace.apply((ws) => removeLineUnit(ws, id));
      activeTeamId.set(parent ? lineSelection(parent) : ($workspace.teams[0]?.id ?? null));
    } else workspace.apply((ws) => (activeArea ? removeArea(ws, id) : removeTeam(ws, id)));
    await tick();
    // Without teams the Calendar shows the start screen and this bar is gone; fall back to the main area.
    (toggle ?? document.getElementById(`${uid}-add`) ?? document.getElementById('main'))?.focus();
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

{#snippet areaIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /></svg
  >
{/snippet}

{#snippet orgIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3 21h18M8 8h3M8 12h3M8 16h3"
    /></svg
  >
{/snippet}

{#snippet teamOption(id: string)}
  <li>
    <button
      type="button"
      class="opt"
      aria-current={id === $activeTeamId ? 'true' : undefined}
      onclick={() => choose(id)}
    >
      <span class="avatar mini" aria-hidden="true">{nameInitials(teamName(id))}</span>
      <span class="opt-name">{teamName(id)}</span>
    </button>
  </li>
{/snippet}

{#snippet lineIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={LINE_ICON} /></svg>
{/snippet}

{#snippet lineOption(u: LineUnit)}
  {@const kids = childUnits($workspace, u.id)}
  {@const n = linePeople($workspace, u.id).size}
  <li>
    <button
      type="button"
      class="opt line"
      aria-current={lineSelection(u.id) === $activeTeamId ? 'true' : undefined}
      onclick={() => choose(lineSelection(u.id))}
    >
      <span class="avatar mini line" aria-hidden="true">{@render lineIcon()}</span>
      <span class="opt-name-line">{u.name}</span>
      <span class="sr-only">{lineLevel(u)}</span>
      <span class="count"
        ><span aria-hidden="true">{n}</span><span class="sr-only">{peopleText(n)}</span></span
      >
    </button>
    {#if kids.length > 0}
      <ul class="kids line-kids">
        {#each kids as kid (kid.id)}{@render lineOption(kid)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="switcher">
  {#if current}
    <button
      type="button"
      class="pick"
      title={pickTitle}
      bind:this={pick}
      aria-expanded={listOpen}
      aria-controls="{uid}-list"
      onclick={openList}
    >
      {#if activeLine}
        <span class="avatar line" aria-hidden="true">{@render lineIcon()}</span>
      {:else if activeOrg}
        <span class="avatar org" aria-hidden="true">{@render orgIcon()}</span>
      {:else if activeArea}
        <span class="avatar area" aria-hidden="true">{@render areaIcon()}</span>
      {:else}
        <span class="avatar" aria-hidden="true">{initials}</span>
      {/if}
      <span class="text">
        <span class="name"
          ><span class="label">{current.name}</span><svg
            class="chev"
            viewBox="0 0 24 24"
            aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg
          ></span
        >
        <span class="meta">
          {#if activeLine}
            {lineLevel(activeLine)} · {peopleText(linePeople($workspace, activeLine.id).size)}
          {:else if activeOrg}
            {$t('org.meta', { count: orgCount })}
          {:else if activeArea}
            {$t('area.meta', { count: teamCount(activeArea) })}
          {:else if active}
            {#if activeAreaOf}<b>{activeAreaOf.name}</b>&#32;·&#32;
            {/if}{$t('team.switcher.meta', {
              kind: $t('team.cadence.kind.' + active.cadence.kind),
              weeks: active.cadence.lengthWeeks,
            })}
          {/if}
        </span>
      </span>
      <span class="sr-only"
        >{$t(areas.length > 0 ? 'team.switcher.pickWithAreas' : 'team.switcher.pick')}</span
      >
    </button>
    <button
      type="button"
      class="toggle"
      data-no-present
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
      class="list"
      id="{uid}-list"
      bind:this={list}
      hidden={!listOpen}
      onkeydown={onListKeydown}
      onfocusout={onListFocusout}
    >
      {#if showOrg}
        <button
          type="button"
          class="opt org"
          aria-current={activeOrg ? 'true' : undefined}
          onclick={() => choose(ORG_UNIT)}
        >
          <span class="avatar mini org" aria-hidden="true">{@render orgIcon()}</span>
          <!-- Not .opt-name: that class lists the teams and areas. -->
          <span class="opt-name-org">{org.name}</span>
          {#if $workspace.organisation}<span class="sr-only">{$t('org.option')}</span>{/if}
          <span class="count org-count">{orgCount}</span>
        </button>
      {/if}
      {#if areas.length > 0}
        <ul>
          {#each areas as area (area.id)}
            <li>
              <button
                type="button"
                class="opt"
                aria-current={area.id === $activeTeamId ? 'true' : undefined}
                onclick={() => choose(area.id)}
              >
                <span class="avatar mini area" aria-hidden="true">{@render areaIcon()}</span>
                <span class="opt-name">{area.name}</span>
                <span class="sr-only">{$t('area.option')}</span>
                <span class="count"
                  ><span aria-hidden="true">{area.teamIds.length}</span><span class="sr-only"
                    >{teamCount(area)}</span
                  ></span
                >
              </button>
              {#if area.teamIds.length > 0}
                <ul class="kids">
                  {#each area.teamIds as id (id)}{@render teamOption(id)}{/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
        {#if ungrouped.length > 0}
          <p class="group" id="{uid}-ungrouped">{$t('area.ungrouped')}</p>
          <ul aria-labelledby="{uid}-ungrouped">
            {#each ungrouped as team (team.id)}{@render teamOption(team.id)}{/each}
          </ul>
        {/if}
      {:else}
        <ul>
          {#each teams as team (team.id)}{@render teamOption(team.id)}{/each}
        </ul>
      {/if}
      {#if lineUnits.length > 0}
        <p class="group line-group" id="{uid}-line">{$t('line.switcher.group')}</p>
        <ul aria-labelledby="{uid}-line">
          {#each childUnits($workspace) as u (u.id)}{@render lineOption(u)}{/each}
        </ul>
      {/if}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="menu"
      data-no-present
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
      <button type="button" onclick={() => run(() => areaDialog?.show())}>{$t('area.add')}</button>
      <button type="button" onclick={() => run(() => lineDialog?.show(undefined, activeLine?.id))}
        >{$t('line.unit.add')}</button
      >
      <hr />
      {#if activeLine}
        {@const unit = activeLine}
        <button type="button" onclick={() => run(() => lineDialog?.show(unit))}
          >{$t('line.unit.editMenu')}</button
        >
        <hr />
        <button type="button" class="danger" onclick={() => run(() => (confirming = true))}
          >{$t('line.unit.delete')}</button
        >
      {:else if activeOrg}
        <button type="button" onclick={() => run(() => openDialog('renameOrg'))}
          >{$t('org.rename')}</button
        >
      {:else if activeArea}
        {@const area = activeArea}
        <button type="button" onclick={() => run(() => openDialog('renameArea'))}
          >{$t('area.rename')}</button
        >
        <button type="button" onclick={() => run(() => areaDialog?.show(area))}
          >{$t('area.teams')}</button
        >
        <hr />
        <button type="button" class="danger" onclick={() => run(() => (confirming = true))}
          >{$t('area.delete')}</button
        >
      {:else}
        <button type="button" onclick={() => run(() => openDialog('rename'))}
          >{$t('team.rename')}</button
        >
        <button type="button" onclick={() => run(duplicate)}>{$t('team.duplicate')}</button>
        <hr />
        <button type="button" class="danger" onclick={() => run(() => (confirming = true))}
          >{$t('team.delete')}</button
        >
      {/if}
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
    <h2 id="{uid}-title">
      {$t(
        mode === 'add'
          ? 'team.dialog.add'
          : mode === 'rename'
            ? 'team.dialog.rename'
            : mode === 'renameOrg'
              ? 'org.rename'
              : 'area.rename',
      )}
    </h2>
    <div class="field">
      <label for="{uid}-name">{$t(nameLabel)}</label>
      <input
        id="{uid}-name"
        type="text"
        placeholder={mode === 'renameOrg' ? $levels.org : undefined}
        bind:value={name}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${uid}-err` : undefined}
        oninput={() => (error = '')}
      />
      {#if error}
        <p class="field-error" id="{uid}-err">
          {$t(error, { path: $t(nameLabel) })}
        </p>
      {/if}
    </div>
    <div class="actions">
      <button type="submit" class="primary">{$t('team.dialog.confirm')}</button>
      <button type="button" onclick={() => dialog?.close()}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<AreaDialog bind:this={areaDialog} returnFocus={() => toggle?.focus()} />
<LineUnitDialog bind:this={lineDialog} returnFocus={() => toggle?.focus()} />

<ConfirmDialog
  open={confirming}
  title={$t('team.delete.title', { name: current?.name ?? '' })}
  message={activeLine
    ? $t('line.unit.delete.message', {
        // Only the unit's own people lose their line unit; sub-units move up with theirs.
        n: $workspace.people.filter((p) => p.lineUnitId === activeLine.id).length,
      })
    : activeArea
      ? [
          $t('area.delete.message'),
          areaLoss.events + areaLoss.people > 0 ? $t('area.delete.goes', areaLoss) : '',
          $t('area.undo'),
        ]
          .filter(Boolean)
          .join(' ')
      : $t('team.delete.message')}
  confirmLabel={$t(activeLine ? 'line.unit.delete' : activeArea ? 'area.delete' : 'team.delete')}
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
  :global(#app) .switcher button.pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    padding: 0.1rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    box-shadow: none;
    color: #fff;
    font: inherit;
    text-align: start;
  }
  :global(#app) .switcher button.pick:hover {
    background: rgb(255 255 255 / 0.06);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    font-size: 0.95rem;
    font-weight: 650;
  }
  /* Long names wrap to two lines, then end in an ellipsis; the tooltip has the rest. */
  .name .label,
  .meta {
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .chev {
    flex: none;
    width: 0.9rem;
    height: 0.9rem;
    margin: 0.2rem 0 0 auto;
    fill: none;
    stroke: var(--side-text);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s;
  }
  .pick[aria-expanded='true'] .chev {
    transform: rotate(180deg);
  }
  .meta b {
    font-weight: 600;
    color: #8ff0e2;
  }
  .avatar.area {
    background: linear-gradient(135deg, #14b8a6, #22c3ee);
  }
  .avatar.org {
    background: linear-gradient(135deg, #3b82f6, #1e3a8a);
  }
  .avatar.line {
    background: linear-gradient(135deg, #db2777, #8b5cf6);
  }
  .avatar svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: #fff;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .avatar.mini {
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 0.4rem;
    font-size: 0.625rem;
  }
  .avatar.mini svg {
    width: 0.85rem;
    height: 0.85rem;
  }
  /* The list of teams and areas, in the flow like the menu. */
  .list {
    flex-basis: 100%;
    margin: 0.15rem -0.2rem 0 -0.35rem;
    padding: 0.35rem;
    max-height: min(60vh, 28rem);
    overflow-y: auto;
    border-radius: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    color: var(--text);
  }
  .list[hidden] {
    display: none;
  }
  .list ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* The guide line runs below the centre of the parent's badge. */
  .list .kids {
    position: relative;
    margin-left: 1rem;
    padding-left: 0.55rem;
  }
  .list .kids::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.15rem;
    bottom: 0.9rem;
    border-left: 2px solid color-mix(in srgb, #14b8a6 50%, transparent);
  }
  .line-group {
    margin-top: 0.35rem;
    border-top: 1px solid var(--border);
  }
  /* The line tree can go several levels deep: each level steps in less than an area's teams,
     so a deep unit keeps room for its name. */
  .list .line-kids {
    padding-left: 0.2rem;
  }
  .list .line-kids::before {
    border-left-color: color-mix(in srgb, #db2777 45%, transparent);
  }
  .group {
    margin: 0;
    padding: 0.5rem 0.6rem 0.2rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  :global(#app) .switcher .list button.opt {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem 0.35rem 0.4rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-weight: 500;
    text-align: start;
  }
  :global(#app) .switcher .list button.opt:hover {
    background: var(--surface-2);
  }
  :global(#app) .switcher .list button.opt[aria-current='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 650;
  }
  /* In the list, names wrap in full: it is where people tell similar names apart. They break
     between words, long compounds by hyphenation, and only a word that still does not fit
     breaks anywhere. */
  .opt-name,
  .opt-name-org,
  .opt-name-line {
    min-width: 0;
    overflow-wrap: break-word;
    hyphens: auto;
  }
  /* A long word like "Organisation" stays whole: its count moves to a line of its own (#338). */
  .opt-name-org {
    hyphens: manual;
  }
  /* The organisation sits above the tree, set off by a hairline. */
  :global(#app) .switcher .list button.opt.org {
    flex-wrap: wrap;
    row-gap: 0.15rem;
    margin-bottom: 0.3rem;
    font-weight: 600;
  }
  .list button.org + * {
    padding-top: 0.3rem;
    border-top: 1px solid var(--border);
  }
  .count.org-count {
    background: var(--org-soft);
    color: var(--org);
  }
  /* Only the number: the teams are listed right below. */
  .count {
    flex: none;
    min-width: 1.25rem;
    margin-left: auto;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.1rem;
    text-align: center;
    color: var(--text-muted);
  }
  @media (max-width: 60rem) {
    :global(#app) .switcher .list button.opt {
      min-height: 2.75rem;
    }
  }
  dialog .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--side-text);
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
  /* Without a team: the note stays on one line; in the narrow sidebar the button wraps below it. */
  .none {
    flex: 1 1 auto;
    margin: 0 0 0 0.25rem;
    white-space: nowrap;
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
