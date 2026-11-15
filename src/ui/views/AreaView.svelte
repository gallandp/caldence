<script lang="ts" module>
  /** The page last shown, kept while the app is open (like the calendar's Week/Month). */
  let remembered: 'structure' | 'overview' = 'structure';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import AreaStructure from '../components/AreaStructure.svelte';

  /**
   * The upper level's page while an area is selected: one sidebar entry, two pages behind a
   * switch. The overview page comes from the caller.
   */
  let { area, overview }: { area: Area; overview: Snippet } = $props();

  let page = $state(remembered);
  $effect(() => {
    remembered = page;
  });
</script>

<div class="area-view">
  {#if page === 'structure'}
    <p class="subtitle">{$t('area.structure.subtitle')}</p>
  {/if}
  <div class="pages" role="group" aria-label={$t('area.view.label')}>
    {#each ['structure', 'overview'] as const as p (p)}
      <button type="button" aria-pressed={page === p} onclick={() => (page = p)}
        >{$t(`area.view.${p}`)}</button
      >
    {/each}
  </div>
  {#if page === 'structure'}
    <AreaStructure {area} />
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
