<script lang="ts">
  import {
    attendees,
    missingRoles,
    participantName,
    type Area,
    type CalEvent,
  } from '../../core/model';
  import { teamRoleIds, unmatchedRoles } from '../../core/areaEdit';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { presenting } from '../state/present';
  import { workspace } from '../state/workspace';
  import RoleLinkDialog from './RoleLinkDialog.svelte';

  /**
   * Who an area meeting invites: one chip per participant ("Product Owner · every team (4)" for
   * a role from every team, with everyone it reaches counted once), then a pill for each team
   * that lacks an invited role. Shared by Meetings & cadence and the area overview.
   */
  let { area, event }: { area: Area; event: CalEvent } = $props();

  const ws = $derived($workspace);
  const roleName = (id: string) => ws.roles.find((r) => r.id === id)?.name ?? id;
  const teamName = (id: string) => ws.teams.find((x) => x.id === id)?.name ?? id;
  /** " · 50 %" after a role that comes to part of the meeting; nothing at a share of 1. */
  const shareSuffix = (share: number) =>
    share >= 1
      ? ''
      : ` · ${$t('meet.role.shareOnly', { share: formatNumber($locale, share * 100, 0) })}`;
  const missing = $derived(missingRoles(ws, area, event));
  /**
   * A missing role the team may call differently: it is not among the team's roles, and the team
   * has roles to choose from. Its pill opens the mapping (#362).
   */
  const mappable = (teamId: string, roleId: string) =>
    !$presenting &&
    teamRoleIds(ws, teamId).length > 0 &&
    unmatchedRoles(ws, area, teamId).includes(roleId);
  let mapping = $state<{ teamId: string; roleId: string; button: HTMLElement } | undefined>();
</script>

<ul class="area-roles">
  {#each event.participants as p, i (i)}
    <li class="area-chip" class:from-teams={p.fromTeams} class:person={p.personId !== undefined}>
      {#if p.fromTeams}<span class="split-dot" aria-hidden="true"></span>{$t(
          'area.fromTeams.count',
          {
            role: participantName(ws, p),
            n: formatNumber($locale, attendees(ws, area.id, p, event).length, 0),
          },
        )}{:else if p.personId !== undefined}<svg
          class="person-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg
        ><span class="sr-only">{$t('meet.person.namedPrefix')}</span>{participantName(
          ws,
          p,
        )}{:else}{participantName(ws, p)}{/if}{shareSuffix(p.share)}
    </li>
  {/each}
</ul>
{#snippet warning()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
{/snippet}
{#each missing as m, i (i)}
  {@const note = $t('area.missingRole', { team: teamName(m.teamId), role: roleName(m.roleId) })}
  {#if mappable(m.teamId, m.roleId)}
    <button
      type="button"
      class="missing"
      aria-label={$t('area.roleLink.choose', { note })}
      onclick={(e) => (mapping = { ...m, button: e.currentTarget })}
      >{@render warning()}{note}<svg
        class="chev"
        data-no-print
        viewBox="0 0 24 24"
        aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
      ></button
    >
  {:else}
    <p class="missing">{@render warning()}{note}</p>
  {/if}
{/each}
{#if mapping}
  <RoleLinkDialog
    {area}
    teamId={mapping.teamId}
    roleId={mapping.roleId}
    onclose={() => {
      const back = mapping?.button;
      mapping = undefined;
      // Back to the pill, unless the mapping made it go away.
      if (back?.isConnected) back.focus();
    }}
  />
{/if}

<style>
  .area-roles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .area-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--area-soft);
    color: var(--area);
    font-size: 0.78rem;
    font-weight: 600;
  }
  /* A person invited by name (#285): outlined, with a person glyph. */
  .area-chip.person {
    background: transparent;
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .person-icon {
    width: 0.85rem;
    height: 0.85rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .split-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: linear-gradient(90deg, var(--area) 50%, var(--accent) 50%);
  }
  .missing {
    display: flex;
    width: fit-content;
    align-items: center;
    gap: 0.4rem;
    margin: 0.4rem 0 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.8rem;
    font-weight: 600;
  }
  /* A pill that opens the mapping (#362): the same warning look, with a chevron as its cue. */
  :global(#app) button.missing {
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.35;
    min-height: 2rem;
    padding: 6px 8px 6px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--warn-soft);
    color: var(--warn);
    box-shadow: none;
    text-align: start;
  }
  :global(#app) button.missing:hover {
    border-color: currentColor;
  }
  :global(#app) button.missing:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .missing .chev {
    width: 0.9rem;
    height: 0.9rem;
    margin-left: -0.1rem;
  }
  .missing svg {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
