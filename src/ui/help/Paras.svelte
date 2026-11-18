<script lang="ts">
  import { shortcut } from './label';
  import { PARAGRAPHS } from './paragraphs';
  import Rich from './Rich.svelte';

  /** Paragraphs of the help by i18n key, with the labels they name (see PARAGRAPHS). */
  let { keys }: { keys: string[] } = $props();
</script>

{#each keys as key (key)}
  <p>
    <Rich
      {key}
      labels={PARAGRAPHS[key]}
      keys={{ undo: $shortcut('undo'), esc: $shortcut('present') }}
    />
  </p>
{/each}
