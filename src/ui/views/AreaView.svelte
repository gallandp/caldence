<script lang="ts" module>
  /** The page last shown, kept while the app is open (like the calendar's Week/Month). */
  let remembered: 'structure' | 'overview' = 'structure';
</script>

<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import AreaReady from '../components/AreaReady.svelte';
  import AreaStructure from '../components/AreaStructure.svelte';
  import RoleList from '../components/RoleList.svelte';
  import { areaReady } from '../state/hints';
  import { workspace } from '../state/workspace';

  /**
   * The upper level's page while an area is selected: one sidebar entry, two pages behind a
   * switch. The overview page comes from the caller.
   */
  let { area, overview, onMeetings }: { area: Area; overview: Snippet; onMeetings: () => void } =
    $props();

  let page = $state(remembered);
  let structure: AreaStructure | undefined = $state();

  /** The card's buttons act on the structure page, so it is shown first. */
  async function onStructure(run: (s: AreaStructure) => void) {
    remembered = page = 'structure';
    await tick();
    if (structure) run(structure);
  }
</script>

<div class="area-view">
  {#if page === 'structure'}
    <p class="subtitle">{$t('area.structure.subtitle')}</p>
  {/if}
  {#if $areaReady === area.id}
    <AreaReady
      {area}
      onTeams={() => onStructure((s) => s.chooseTeams())}
      onPeople={() => onStructure((s) => s.addPerson())}
      onMeetings={() => {
        areaReady.set(undefined);
        onMeetings();
      }}
      onClose={() => areaReady.set(undefined)}
    />
  {/if}
  <div class="pages" role="group" aria-label={$t('area.view.label')}>
    {#each ['structure', 'overview'] as const as p (p)}
      <button type="button" aria-pressed={page === p} onclick={() => (remembered = page = p)}
        >{$t(`area.view.${p}`)}</button
      >
    {/each}
  </div>
  {#if page === 'structure'}
    <AreaStructure bind:this={structure} {area} />
    <!-- Roles are shared by all units; listed here too, so area roles need no detour via a team. -->
    <details class="roles">
      <summary>{$t('area.roles.edit', { count: $workspace.roles.length })}</summary>
      <RoleList />
    </details>
  {:else}
    {@render overview()}
  {/if}
</div>

<style>
  .area-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .roles {
    max-width: 44rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .roles summary {
    width: fit-content;
    padding-block: 0.6rem;
    color: var(--accent-text);
    font-weight: 600;
    cursor: pointer;
  }
  .roles[open] summary {
    margin-bottom: 0.75rem;
  }
  .subtitle {
    margin: -0.5rem 0 0;
    color: var(--text-muted);
  }
  /* Tabs, not a segmented pill, so the page switch never looks like Tree | Table. */
  .pages {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
  }
  :global(#app) .pages button {
    min-height: 2.75rem;
    margin-bottom: -1px;
    padding: 0.4rem 1rem;
    border: 0;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
    font-weight: 600;
  }
  :global(#app) .pages button:hover {
    color: var(--text);
    background: none;
  }
  :global(#app) .pages button[aria-pressed='true'] {
    border-bottom-color: var(--accent);
    color: var(--text);
  }
  @media (forced-colors: active) {
    :global(#app) .pages button[aria-pressed='true'] {
      border-bottom-color: Highlight;
      text-decoration: underline;
    }
  }
</style>
