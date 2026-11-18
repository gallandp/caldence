<script lang="ts">
  import { translate as t } from '../../i18n';
  import { shortcut } from './label';
  import { PARAGRAPHS } from './paragraphs';
  import Rich from './Rich.svelte';

  /**
   * Paragraphs of the help by i18n key, with the labels they name (see PARAGRAPHS). A view name
   * (`view.…`) or a `….title` key is a subheading.
   */
  let { keys }: { keys: string[] } = $props();
</script>

{#each keys as key (key)}
  {#if key.startsWith('view.') || key.endsWith('.title')}
    <h4>{$t(key)}</h4>
  {:else}
    <p>
      <Rich
        {key}
        labels={PARAGRAPHS[key]}
        keys={{ undo: $shortcut('undo'), esc: $shortcut('present') }}
      />
    </p>
  {/if}
{/each}
