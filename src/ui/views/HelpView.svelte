<script lang="ts">
  import { translate as t } from '../../i18n';
  import Accessibility from '../help/Accessibility.svelte';
  import CalendarImport from '../help/CalendarImport.svelte';
  import Files from '../help/Files.svelte';
  import FirstSteps from '../help/FirstSteps.svelte';
  import Keyboard from '../help/Keyboard.svelte';
  import LoadCalc from '../help/LoadCalc.svelte';
  import { SECTIONS } from '../help/sections';
  import Templates from '../help/Templates.svelte';
  import Views from '../help/Views.svelte';
  import Where from '../help/Where.svelte';
</script>

<div class="help">
  <nav aria-label={$t('help.toc')}>
    <ol>
      {#each SECTIONS as section (section.id)}
        <li><a href="#{section.id}">{$t(section.title)}</a></li>
      {/each}
    </ol>
  </nav>

  <FirstSteps />
  <Views />
  <LoadCalc />
  <Where />
  <Templates />
  <Files />
  <CalendarImport />
  <Keyboard />
  <Accessibility />
</div>

<style>
  .help {
    min-width: 0;
  }
  nav {
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  nav ol {
    margin: 0;
    padding-left: 1.25rem;
    columns: 2 14rem;
  }
  nav li {
    break-inside: avoid;
    padding: 0.15rem 0;
  }
  .help :global(a) {
    color: var(--accent-text);
  }
  .help :global(section) {
    scroll-margin-top: 1rem;
  }
  .help :global(h3) {
    scroll-margin-top: 1rem;
  }
  .help :global(.scroll) {
    overflow-x: auto;
  }
  .help :global(table) {
    border-collapse: collapse;
    width: 100%;
  }
  .help :global(th),
  .help :global(td) {
    border: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  .help :global(thead th) {
    background: var(--surface);
  }
  .help :global(kbd) {
    font-family: inherit;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: nowrap;
  }
</style>
