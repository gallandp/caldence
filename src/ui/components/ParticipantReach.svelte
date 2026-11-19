<script lang="ts">
  import { canLinkRole } from '../../core/areaEdit';
  import { areaHours } from '../../core/load';
  import { holders, missingRoles, teamRolesFor, type Area, type Workspace } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { presenting } from '../state/present';
  import RoleLinkDialog from './RoleLinkDialog.svelte';

  /**
   * Under a participant row of an area meeting: who the row reaches, the teams where nobody has
   * the role, and the people without hours in the area.
   */
  let {
    ws,
    area,
    roleId,
    fromTeams,
    named = [],
    onSetHours,
  }: {
    ws: Workspace;
    area: Area;
    roleId: string;
    fromTeams: boolean;
    /** People the meeting invites by name: they count on their own row, not here. */
    named?: string[];
    onSetHours?: (personId?: string) => void;
  } = $props();

  /** Names shown before "+ n more". */
  const MAX = 6;

  const participant = $derived({ roleId, share: 1, fromTeams });
  const all = $derived(holders(ws, area.id, participant));
  const people = $derived(all.filter((id) => !named.includes(id)));
  const nameOf = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const roleName = $derived(ws.roles.find((r) => r.id === roleId)?.name ?? roleId);

  /** "Mia (Alpha)": where a person invited from the teams has the role. */
  function label(personId: string): string {
    const where = [
      ...(area.members.some((m) => m.personId === personId && m.roleId === roleId)
        ? [area.name]
        : []),
      ...ws.teams
        .filter(
          (x) =>
            area.teamIds.includes(x.id) &&
            x.members.some(
              (m) =>
                m.personId === personId &&
                (fromTeams ? teamRolesFor(area, x.id, roleId) : [roleId]).includes(m.roleId),
            ),
        )
        .map((x) => x.name),
    ];
    return `${nameOf(personId)} (${where.join(', ')})`;
  }

  const listed = $derived.by(() => {
    const names = people.slice(0, MAX).map(label);
    if (people.length > MAX) names.push($t('area.participants.more', { n: people.length - MAX }));
    return names.join(', ');
  });
  const missing = $derived(
    fromTeams
      ? missingRoles(ws, area, {
          id: '',
          name: '',
          categoryId: '',
          rule: { type: 'weekly', weekday: 1 },
          time: '00:00',
          duration: 1,
          participants: [participant],
          preparation: 0,
        }).map((m) => m.teamId)
      : [],
  );
  const teamName = (id: string) => ws.teams.find((x) => x.id === id)?.name ?? id;
  /** A team that may call the role differently: its note opens the mapping (#433). */
  let mapping = $state<{ teamId: string; button: HTMLElement } | undefined>();
  let reach = $state<HTMLElement | undefined>();
  /** Once the mapping made the note go away: the next one, or the row's "who" choice. */
  const next = () =>
    reach?.querySelector<HTMLElement>('button.warn') ??
    reach?.closest('li')?.querySelector<HTMLElement>('[data-field$=".fromTeams"]');
  const noHoursIds = $derived(people.filter((id) => areaHours(ws, area.id, id) === 0));
  const noHours = $derived(noHoursIds.map(nameOf));
</script>

{#snippet warning()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
{/snippet}
<div class="reach" bind:this={reach}>
  {#if all.length === 0}
    <p class="who">{$t('area.participants.nobody')}</p>
  {:else if people.length === 0}
    <p class="who">{$t('area.participants.allNamed')}</p>
  {:else if fromTeams}
    <p class="who">
      <span class="dot" aria-hidden="true"></span>{$t(
        people.length === 1 ? 'area.participants.resolved.one' : 'area.participants.resolved.other',
        { n: people.length, names: listed },
      )}
    </p>
  {:else}
    <ul class="chips">
      {#each people as id (id)}<li>{nameOf(id)}</li>{/each}
    </ul>
  {/if}
  {#each missing as teamId (teamId)}
    {@const note = $t('area.missingRole', { team: teamName(teamId), role: roleName })}
    {#if !$presenting && canLinkRole(ws, teamId, roleId)}
      <button
        type="button"
        class="warn"
        aria-label={$t('area.roleLink.choose', { note })}
        onclick={(e) => (mapping = { teamId, button: e.currentTarget })}
        >{@render warning()}<span class="grow">{note}</span><svg
          class="chev"
          viewBox="0 0 24 24"
          aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
        ></button
      >
    {:else}
      <p class="warn" role="note">{@render warning()}{note}</p>
    {/if}
  {/each}
  {#if noHours.length > 0}
    <p class="warn" role="note">
      {@render warning()}<span class="grow"
        >{$t(
          noHours.length === 1
            ? 'area.participants.noHours.one'
            : 'area.participants.noHours.other',
          { names: noHours.join(', ') },
        )}</span
      >
      {#if onSetHours}
        <button
          type="button"
          class="link"
          onclick={() => onSetHours(noHoursIds.length === 1 ? noHoursIds[0] : undefined)}
          >{$t('area.participants.setHours')}</button
        >
      {/if}
    </p>
  {/if}
</div>
{#if mapping}
  <RoleLinkDialog
    {area}
    teamId={mapping.teamId}
    {roleId}
    opener={mapping.button}
    fallback={next}
    onclose={() => (mapping = undefined)}
  />
{/if}

<style>
  .reach {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  p {
    margin: 0;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: linear-gradient(90deg, var(--area) 50%, var(--accent) 50%);
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .chips li {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--area-soft);
    color: var(--area);
    font-weight: 600;
  }
  .warn {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--warn-soft);
    color: var(--warn);
    font-weight: 600;
  }
  .warn svg {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* A note that opens the mapping (#433): the same look, with a chevron as its cue. */
  :global(#app) .reach button.warn {
    min-height: 2.75rem;
    margin: 0;
    padding: 6px 8px 6px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--warn-soft);
    color: var(--warn);
    box-shadow: none;
    font: inherit;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  :global(#app) .reach button.warn:hover {
    border-color: currentColor;
  }
  :global(#app) .reach button.warn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .warn svg.chev {
    width: 0.9rem;
    height: 0.9rem;
  }
  .grow {
    flex: 1;
  }
  :global(#app) .reach button.link {
    border: 0;
    background: none;
    box-shadow: none;
    padding: 0;
    min-height: 0;
    font-weight: 600;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
