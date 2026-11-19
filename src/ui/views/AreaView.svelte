<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import AreaReady from '../components/AreaReady.svelte';
  import AreaStructure from '../components/AreaStructure.svelte';
  import AreaTeams from '../components/AreaTeams.svelte';
  import RoleList from '../components/RoleList.svelte';
  import OwnerCard from '../components/OwnerCard.svelte';
  import PageTabs from '../components/PageTabs.svelte';
  import { hasOwnerRoles } from '../../core/owners';
  import { areaReady } from '../state/hints';
  import { workspace } from '../state/workspace';
  import { areaPage } from '../state/view';

  /**
   * The upper level's page while an area is selected: one sidebar entry, two pages behind a
   * switch. The overview page comes from the caller.
   */
  let { area, overview, onMeetings }: { area: Area; overview: Snippet; onMeetings: () => void } =
    $props();

  // A new area opens on its structure, where the "ready" card's steps act (only when shown).
  // The page last shown is kept while the app is open and saved in the file (Q5).
  $effect(() => {
    if ($areaReady === area.id) areaPage.set('structure');
  });
  const page = $derived($areaPage);
  let pages: HTMLDivElement | undefined = $state();

  /** Closing the card removes the focused button: focus moves to the page switch. */
  async function closeCard() {
    areaReady.set(undefined);
    await tick();
    pages?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
  }
  let structure: AreaStructure | undefined = $state();

  /** The card's buttons act on the structure page, so it is shown first. */
  async function onStructure(run: (s: AreaStructure) => void) {
    areaPage.set('structure');
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
      onClose={closeCard}
    />
  {/if}
  <PageTabs bind:el={pages} />
  {#if page === 'structure'}
    <!-- Where people build: the way into a team to assign people and roles (#277). -->
    {#if area.teamIds.length > 0}
      <div data-no-present><AreaTeams {area} view="team" /></div>
    {/if}
    {#if hasOwnerRoles($workspace)}
      <!-- The platform's owner set-up (#331); a missing owner opens "+ Person" with its role. -->
      <OwnerCard unit={area} level="area" onAssign={(roleId) => structure?.addPerson(roleId)} />
    {/if}
    <AreaStructure bind:this={structure} {area} />
    <!-- Roles are shared by all units; listed here too, so area roles need no detour via a team. -->
    <details class="roles" data-no-present>
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
</style>
