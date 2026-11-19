<script lang="ts">
  import {
    attendees,
    missingRoles,
    participantName,
    type Area,
    type CalEvent,
  } from '../../core/model';
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
{#each missing as m, i (i)}
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
  /* A long role or team name wraps anywhere instead of widening a phone's meeting card (#431). */
  .area-chip,
  .missing {
    overflow-wrap: anywhere;
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
