<script lang="ts">
  import { untrack } from 'svelte';
  import { levels, translate as t } from '../i18n';
  import { ORG_UNIT, selectionPeople } from '../core/model';
  import { activeTeamId, filter, workspace } from './state/workspace';

  const uid = $props.id();

  let roleId = $state('');
  let personId = $state('');
  /**
   * With an area selected: one of its teams, or '' for the whole area. With the organisation: one
   * of its areas or teams, or '' for all.
   */
  let teamId = $state('');

  const org = $derived($activeTeamId === ORG_UNIT);
  const area = $derived($workspace.areas.find((a) => a.id === $activeTeamId));
  const areaTeams = $derived(
    area ? $workspace.teams.filter((team) => area.teamIds.includes(team.id)) : [],
  );
  /** With a line unit selected only its people can be picked (#316). */
  const people = $derived.by(() => {
    const only = selectionPeople($workspace, $activeTeamId ?? undefined);
    return only ? $workspace.people.filter((p) => only.has(p.id)) : $workspace.people;
  });
  /** The units the Team filter offers: the area's teams, or every area and team. */
  const choices = $derived(org ? [...$workspace.areas, ...$workspace.teams] : areaTeams);

  // A filter must not point at something that was deleted or replaced by an undo or an opened file.
  $effect(() => {
    if (roleId !== '' && !$workspace.roles.some((r) => r.id === roleId)) roleId = '';
    if (personId !== '' && !people.some((p) => p.id === personId)) personId = '';
    // Also when another team or area is picked, or the team leaves the area.
    if (teamId !== '' && !choices.some((unit) => unit.id === teamId)) teamId = '';
  });

  // A person chosen from another view, such as a week link in Meeting load (#343).
  $effect(() => {
    const chosen = $filter.personId ?? '';
    if (chosen !== untrack(() => personId)) personId = chosen;
  });

  // The person view spans all teams; otherwise the filter follows the active team.
  $effect(() => {
    if (personId !== '') filter.set({ personId });
    else {
      const next: { teamId?: string; roleId?: string } = {};
      if (teamId !== '') next.teamId = teamId;
      // The organisation is everything, the same as no team filter.
      else if ($activeTeamId !== null && !org) next.teamId = $activeTeamId;
      if (roleId !== '') next.roleId = roleId;
      filter.set(next);
    }
  });
</script>

<div class="filters" role="region" aria-label={$t('filter.label')}>
  <span class="for">{$t('filter.label')}</span>
  {#if area}
    <div class="field">
      <label for="{uid}-team">{$t('filter.team')}</label>
      <select id="{uid}-team" bind:value={teamId} disabled={personId !== ''}>
        <option value="">{$t('filter.allTeams')}</option>
        {#each areaTeams as team (team.id)}
          <option value={team.id}>{team.name}</option>
        {/each}
      </select>
    </div>
  {:else if org}
    <div class="field">
      <label for="{uid}-team"
        >{$t($workspace.areas.length > 0 ? 'filter.unit' : 'filter.team')}</label
      >
      <select id="{uid}-team" bind:value={teamId} disabled={personId !== ''}>
        <option value="">{$t('filter.all')}</option>
        {#if $workspace.areas.length > 0}
          <optgroup label={$levels.areas}>
            {#each $workspace.areas as unit (unit.id)}
              <option value={unit.id}>{unit.name}</option>
            {/each}
          </optgroup>
          <optgroup label={$levels.teams}>
            {#each $workspace.teams as unit (unit.id)}
              <option value={unit.id}>{unit.name}</option>
            {/each}
          </optgroup>
        {:else}
          {#each $workspace.teams as unit (unit.id)}
            <option value={unit.id}>{unit.name}</option>
          {/each}
        {/if}
      </select>
    </div>
  {/if}
  <div class="field">
    <label for="{uid}-role">{$t('filter.role')}</label>
    <select id="{uid}-role" bind:value={roleId} disabled={personId !== ''}>
      <option value="">{$t('filter.all')}</option>
      {#each $workspace.roles as role (role.id)}
        <option value={role.id}>{role.name}</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="{uid}-person">{$t('filter.person')}</label>
    <select id="{uid}-person" bind:value={personId}>
      <option value="">{$t('filter.all')}</option>
      {#each people as person (person.id)}
        <option value={person.id}>{person.name}</option>
      {/each}
    </select>
  </div>
  {#if personId !== ''}
    <p class="scope">{$t('filter.allTeams')}</p>
  {/if}
</div>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .for {
    padding-block: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .scope {
    margin: 0;
    padding-block: 0.4rem;
    font-weight: 600;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
  select:disabled {
    opacity: 0.6;
  }
</style>
