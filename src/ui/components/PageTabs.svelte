<script lang="ts">
  import { translate as t } from '../../i18n';
  import { areaPage } from '../state/view';

  /**
   * "Structure | Overview" above the page of an area or of the organisation (#322). Tabs, not a
   * segmented pill, so the page switch never looks like Tree | Table.
   */
  let { el = $bindable() }: { el?: HTMLDivElement } = $props();

  const pages = ['structure', 'overview'] as const;
</script>

<div class="pages" data-no-print role="group" aria-label={$t('area.view.label')} bind:this={el}>
  {#each pages as p (p)}
    <button type="button" aria-pressed={$areaPage === p} onclick={() => areaPage.set(p)}
      >{$t(`area.view.${p}`)}</button
    >
  {/each}
</div>

<style>
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
