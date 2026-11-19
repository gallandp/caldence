<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { matchingRole, setRoleLinks, teamRoleIds } from '../../core/areaEdit';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { applyOwn } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';

  /**
   * Maps one area role that a team lacks to one of the team's roles, right from the "No X in
   * team" note of an area meeting, the structure tree or the meeting form (#362, #433); the same
   * link as in "Choose teams …" (#338). An obvious match is preselected, the coach confirms it.
   * On closing, focus goes back to the note, or, once the mapping made it go away, to `fallback`.
   */
  let {
    area,
    teamId,
    roleId,
    opener,
    fallback,
    onclose,
  }: {
    area: Area;
    teamId: string;
    roleId: string;
    opener: HTMLElement;
    fallback?: () => HTMLElement | null | undefined;
    onclose: () => void;
  } = $props();
  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  let general = $state('');

  const ws = $derived($workspace);
  const roleName = (id: string) => ws.roles.find((r) => r.id === id)?.name ?? id;
  const teamName = $derived(ws.teams.find((x) => x.id === teamId)?.name ?? teamId);
  const options = $derived(teamRoleIds(ws, teamId));
  const linked = $derived(area.roleLinks?.find((l) => l.teamId === teamId && l.roleId === roleId));
  /**
   * The obvious match among the team's roles that no other area role is linked to yet, the roles
   * its people hold first.
   */
  const suggested = $derived.by(() => {
    const taken = new Set(
      (area.roleLinks ?? []).flatMap((l) =>
        l.teamId === teamId && l.roleId !== roleId ? [l.teamRoleId] : [],
      ),
    );
    const free = options.filter((id) => !taken.has(id));
    const held = new Set(ws.teams.find((x) => x.id === teamId)?.members.map((m) => m.roleId));
    const pick = (ids: string[]) =>
      matchingRole(
        roleName(roleId),
        ids.map((id) => ({ id, name: roleName(id) })),
      );
    return pick(free.filter((id) => held.has(id))) ?? pick(free);
  });
  /** The stored link, if its role is still one of the team's; otherwise the suggestion. */
  let value = $state(
    untrack(() =>
      linked ? (options.includes(linked.teamRoleId) ? linked.teamRoleId : '') : (suggested ?? ''),
    ),
  );

  onMount(() => dialog?.showModal());

  async function closed() {
    // Read before closing: the props are gone once the dialog is.
    const [back, next] = [opener, fallback];
    onclose();
    await tick();
    if (back.isConnected) back.focus();
    else next?.()?.focus();
  }

  function save(event: Event) {
    event.preventDefault();
    // The dialog may sit inside another form (the meeting form): that one is not submitted.
    event.stopPropagation();
    const rest = (area.roleLinks ?? []).filter(
      (l) => !(l.teamId === teamId && l.roleId === roleId),
    );
    const links = value ? [...rest, { teamId, roleId, teamRoleId: value }] : rest;
    // A change from the open view: an open meeting form keeps its draft.
    const result = applyOwn((w) => setRoleLinks(w, area.id, links));
    if (!result.ok) {
      general = result.errors[0]?.key ?? 'error.type';
      return;
    }
    dialog?.close();
  }
</script>

<!-- Nor does it see this dialog's edits, or its Escape, as its own. -->
<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  onclose={closed}
  oninput={(e) => e.stopPropagation()}
  onchange={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    if (e.key === 'Escape') e.stopPropagation();
  }}
>
  <form onsubmit={save}>
    <h2 id="{uid}-title">{$t('area.missingRole', { team: teamName, role: roleName(roleId) })}</h2>
    <p class="hint">
      {$t('area.roleLink.hint', { team: teamName, chooseTeams: $t('area.teams') })}
    </p>
    <div class="field">
      <label for="{uid}-role"
        >{$t('area.roleLinks.label', { role: roleName(roleId), team: teamName })}</label
      >
      <select
        id="{uid}-role"
        bind:value
        aria-describedby={!linked && suggested && value === suggested ? `${uid}-why` : undefined}
      >
        <option value="">{$t('area.roleLinks.none')}</option>
        {#each options as id (id)}
          <option value={id}>{roleName(id)}</option>
        {/each}
      </select>
      {#if !linked && suggested && value === suggested}
        <p class="hint" id="{uid}-why">{$t('area.roleLink.suggested')}</p>
      {/if}
    </div>
    {#if general}
      <p class="field-error" role="alert">{$t(general, { path: $t('area.roleLinks.title') })}</p>
    {/if}
    <div class="actions">
      <button type="submit" class="primary">{$t('team.dialog.confirm')}</button>
      <button type="button" onclick={() => dialog?.close()}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(26rem, calc(100vw - 2 * var(--space)));
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
  .hint {
    margin: 0 0 var(--space);
    font-size: 0.85rem;
    color: var(--text-muted, var(--text));
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .field .hint {
    margin: 0;
  }
  label {
    font-weight: 600;
  }
  select {
    font: inherit;
    min-width: 0;
    min-height: 2.75rem;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.3rem 0.4rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: calc(var(--space) * 1.25);
  }
</style>
