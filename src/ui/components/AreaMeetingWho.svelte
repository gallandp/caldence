<script lang="ts">
  import { attendees, missingRoles, type Area, type CalEvent } from '../../core/model';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

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
</script>

<ul class="area-roles">
  {#each event.participants as p, i (i)}
    <li class="area-chip" class:from-teams={p.fromTeams}>
      {#if p.fromTeams}<span class="split-dot" aria-hidden="true"></span>{$t(
          'area.fromTeams.count',
          {
            role: roleName(p.roleId),
            n: formatNumber($locale, attendees(ws, area.id, p).length, 0),
          },
        )}{:else}{roleName(p.roleId)}{/if}{shareSuffix(p.share)}
    </li>
  {/each}
</ul>
{#each missing as m (m.teamId + m.roleId)}
  <p class="missing">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg
    >{$t('area.missingRole', { team: teamName(m.teamId), role: roleName(m.roleId) })}
  </p>
{/each}

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
