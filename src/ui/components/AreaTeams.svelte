<script lang="ts">
  import { tick } from 'svelte';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import AreaNoTeams from './AreaNoTeams.svelte';
  import { activeTeamId, workspace } from '../state/workspace';

  /** A view that works per team shows this while an area is selected: the area's teams to pick. */
  let { area, view }: { area: Area; view: 'team' } = $props();

  /** The view replaces this panel; focus goes to the view's panel so it is not lost. */
  async function open(id: string) {
    activeTeamId.set(id);
    await tick();
    document.getElementById(`panel-${view}`)?.focus();
  }

  const teams = $derived(area.teamIds.flatMap((id) => $workspace.teams.filter((x) => x.id === id)));
</script>

<section class="area-teams" data-no-print>
  {#if teams.length === 0}
    <!-- Only the overview shows this empty state; once teams are chosen, focus goes to the first one. -->
    <AreaNoTeams {area} focusAfter="[data-area-costs] tbody button" />
  {:else}
    <p>{$t(`area.view.${view}`, { name: area.name })}</p>
    <ul>
      {#each teams as team (team.id)}
        <li>
          <button type="button" onclick={() => open(team.id)}>
            <span class="avatar" aria-hidden="true">{initials(team.name)}</span>
            {team.name}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .area-teams {
    max-width: 40rem;
    padding: calc(var(--space) * 1.5);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  p {
    margin: 0 0 var(--space);
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.45rem;
    background: linear-gradient(135deg, #8b7bff, #22c3ee);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 750;
  }
</style>
