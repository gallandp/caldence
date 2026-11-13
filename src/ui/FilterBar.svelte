<script lang="ts">
  import { translate as t } from '../i18n';
  import { activeTeamId, filter, workspace } from './state/workspace';

  const uid = $props.id();

  let roleId = $state('');
  let personId = $state('');

  // A filter must not point at something that was deleted or replaced by an undo or an opened file.
  $effect(() => {
    if (roleId !== '' && !$workspace.roles.some((r) => r.id === roleId)) roleId = '';
    if (personId !== '' && !$workspace.people.some((p) => p.id === personId)) personId = '';
  });

  // The person view spans all teams; otherwise the filter follows the active team.
  $effect(() => {
    if (personId !== '') filter.set({ personId });
    else {
      const next: { teamId?: string; roleId?: string } = {};
      if ($activeTeamId !== null) next.teamId = $activeTeamId;
      if (roleId !== '') next.roleId = roleId;
      filter.set(next);
    }
  });
</script>

<div class="filters" role="region" aria-label={$t('filter.label')}>
  <span class="for">{$t('filter.label')}</span>
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
      {#each $workspace.people as person (person.id)}
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
