<script lang="ts">
  import { tick } from 'svelte';
  import { setRoleLinks, teamRoleIds, unmatchedRoles } from '../core/areaEdit';
  import { addArea, setAreaTeams } from '../core/edit';
  import type { Area, RoleLink } from '../core/model';
  import { translate as t } from '../i18n';
  import ConfirmDialog, { type Choice } from './components/ConfirmDialog.svelte';
  import { areaReady } from './state/hints';
  import { activeTeamId, workspace } from './state/workspace';

  /** Where focus goes when the dialog closes (the switcher's menu button). */
  let { returnFocus }: { returnFocus?: () => void } = $props();
  const uid = $props.id();

  let dialog: HTMLDialogElement | undefined;
  /** The area whose teams are chosen; none while a new area is added. */
  let area = $state<Area | undefined>();
  let name = $state('');
  let chosen = $state<string[]>([]);
  /** An empty name, shown at the name field. */
  let error = $state('');
  /** Any other refusal (the area limit, a team that is gone), shown above the buttons. */
  let general = $state('');
  let confirming = $state(false);
  /** The team role chosen for each area role a team does not have, by team and role (#338). */
  let links = $state<Record<string, string>>({});
  const linkKey = (teamId: string, roleId: string) => `${teamId} ${roleId}`;

  const teams = $derived($workspace.teams);
  /** The other area a team is in now, if any. */
  const otherArea = (teamId: string) =>
    $workspace.areas.find((a) => a.id !== area?.id && a.teamIds.includes(teamId));
  const moves = $derived(
    chosen.flatMap((id) => {
      const from = otherArea(id);
      const team = teams.find((x) => x.id === id);
      return from && team ? [{ team: team.name, from: from.name }] : [];
    }),
  );

  const roleName = (id: string) => $workspace.roles.find((r) => r.id === id)?.name ?? id;
  /**
   * The chosen teams that lack a role the area's meetings invite from every team, with the
   * roles they could send instead; a team without any role has nothing to choose from.
   */
  const mapping = $derived(
    area
      ? chosen.flatMap((teamId) => {
          const team = teams.find((x) => x.id === teamId);
          const options = teamRoleIds($workspace, teamId);
          const roles = unmatchedRoles($workspace, area!, teamId);
          return team && options.length > 0 && roles.length > 0 ? [{ team, roles, options }] : [];
        })
      : [],
  );

  /** Opens the dialog to add an area, or to choose the teams of `of`. */
  export async function show(of?: Area) {
    area = of;
    name = '';
    chosen = of ? [...of.teamIds] : [];
    links = Object.fromEntries(
      (of?.roleLinks ?? []).map((l) => [linkKey(l.teamId, l.roleId), l.teamRoleId]),
    );
    error = '';
    general = '';
    await tick();
    dialog?.showModal();
    if (!of) dialog?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
  }

  function submit(event: Event) {
    event.preventDefault();
    if (!area && name.trim() === '') {
      error = 'team.error.empty';
      return;
    }
    if (moves.length > 0) confirming = true;
    else save();
  }

  function save() {
    const value = name.trim();
    const target = area;
    const chosenLinks: RoleLink[] = mapping.flatMap(({ team, roles }) =>
      roles.flatMap((roleId) => {
        const teamRoleId = links[linkKey(team.id, roleId)];
        return teamRoleId ? [{ teamId: team.id, roleId, teamRoleId }] : [];
      }),
    );
    const result = target
      ? workspace.apply((ws) => {
          const r = setAreaTeams(ws, target.id, chosen);
          return r.ok ? setRoleLinks(r.value, target.id, chosenLinks) : r;
        })
      : workspace.apply((ws) => addArea(ws, value, chosen));
    if (!result.ok) {
      general = result.errors[0]?.key ?? 'error.type';
      return;
    }
    if (!target && result.id) {
      activeTeamId.set(result.id);
      areaReady.set(result.id);
    }
    dialog?.close();
  }

  function onConfirm(choice: Choice) {
    confirming = false;
    if (choice === 'save') save();
  }

  const destination = $derived(area?.name ?? name.trim());
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  onclose={() => {
    if (!confirming) returnFocus?.();
  }}
>
  <form onsubmit={submit}>
    <h2 id="{uid}-title">{area ? $t('area.teams.title', { name: area.name }) : $t('area.add')}</h2>
    {#if !area}
      <div class="field">
        <label for="{uid}-name">{$t('area.dialog.name')}</label>
        <input
          id="{uid}-name"
          type="text"
          bind:value={name}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${uid}-err` : undefined}
          oninput={() => (error = '')}
        />
        {#if error}
          <p class="field-error" id="{uid}-err">{$t(error, { path: $t('area.dialog.name') })}</p>
        {/if}
      </div>
    {/if}
    <fieldset>
      <legend>{$t('area.dialog.teams')}</legend>
      {#if teams.length === 0}
        <p class="hint">{$t('area.dialog.noTeams')}</p>
      {:else}
        <div class="checks">
          {#each teams as team (team.id)}
            {@const from = otherArea(team.id)}
            <label class="check">
              <input
                type="checkbox"
                value={team.id}
                bind:group={chosen}
                onchange={() => (general = '')}
              />
              <span class="label">{team.name}</span>
              {#if from}
                <span class="tag" class:move={chosen.includes(team.id)}
                  >{$t(chosen.includes(team.id) ? 'area.dialog.from' : 'area.dialog.in', {
                    area: from.name,
                  })}</span
                >
              {/if}
            </label>
          {/each}
        </div>
      {/if}
      <p class="hint">{$t('area.dialog.hint')}</p>
    </fieldset>
    {#if mapping.length > 0}
      <fieldset class="roles">
        <legend>{$t('area.roleLinks.title')}</legend>
        <p class="hint">{$t('area.roleLinks.hint')}</p>
        {#each mapping as { team, roles, options } (team.id)}
          <div class="team-roles">
            <p class="team-name">{team.name}</p>
            {#each roles as roleId (roleId)}
              {@const key = linkKey(team.id, roleId)}
              <div class="link">
                <label for="{uid}-{key.replace(' ', '-')}"
                  ><span class="sr-only"
                    >{$t('area.roleLinks.label', { role: roleName(roleId), team: team.name })}</span
                  ><span aria-hidden="true">{roleName(roleId)}</span></label
                >
                <span class="arrow" aria-hidden="true">→</span>
                <select
                  id="{uid}-{key.replace(' ', '-')}"
                  value={links[key] ?? ''}
                  onchange={(e) => (links = { ...links, [key]: e.currentTarget.value })}
                >
                  <option value="">{$t('area.roleLinks.none')}</option>
                  {#each options as id (id)}
                    <option value={id}>{roleName(id)}</option>
                  {/each}
                </select>
              </div>
            {/each}
          </div>
        {/each}
      </fieldset>
    {/if}
    {#if general}
      <p class="field-error" role="alert">{$t(general, { path: $t('area.dialog.teams') })}</p>
    {/if}
    <div class="actions">
      <button type="submit" class="primary"
        >{$t(area ? 'team.dialog.confirm' : 'area.dialog.add')}</button
      >
      <button type="button" onclick={() => dialog?.close()}>{$t('dialog.cancel')}</button>
    </div>
  </form>
</dialog>

<ConfirmDialog
  open={confirming}
  title={$t('area.move.title')}
  message={$t('area.move.message', {
    to: destination,
    list: moves.map((m) => $t('area.move.item', { team: m.team, from: m.from })).join(', '),
  })}
  confirmLabel={$t('area.move.confirm')}
  discard={false}
  onchoose={onConfirm}
/>

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
  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    font-weight: 600;
  }
  .checks {
    margin-top: 0.35rem;
    padding: 0.25rem;
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.5rem;
    padding: 0.25rem 0.45rem;
    border-radius: 0.45rem;
    cursor: pointer;
  }
  .check:hover {
    background: var(--surface-2);
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    margin-left: auto;
    flex: none;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted, var(--text));
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .tag.move {
    background: var(--warn-soft);
    color: var(--warn);
    font-weight: 600;
  }
  .hint {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: var(--text-muted, var(--text));
  }
  .roles {
    margin-top: var(--space);
  }
  .roles .hint {
    margin: 0.15rem 0 0.5rem;
  }
  .team-roles {
    padding: 0.35rem 0.6rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .team-roles + .team-roles {
    margin-top: 0.5rem;
  }
  .team-name {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted, var(--text));
  }
  .link {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
  }
  .link label {
    overflow-wrap: break-word;
  }
  .arrow {
    color: var(--text-muted, var(--text));
  }
  /* On phones the role sits above its choice, so the select can show whole role names. */
  @media (max-width: 40rem) {
    .link {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
      padding: 0.2rem 0 0.35rem;
    }
    .arrow {
      display: none;
    }
    select {
      min-height: 2.75rem;
    }
  }
  select {
    font: inherit;
    min-width: 0;
    min-height: 2.25rem;
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
    margin-top: var(--space);
  }
</style>
