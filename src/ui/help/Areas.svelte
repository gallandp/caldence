<script lang="ts">
  import { AREA_LABELS, AREA_PARTS } from './areas';
  import Rich from './Rich.svelte';
</script>

{#each AREA_PARTS as part (part)}
  <p><Rich key={'help.areas.' + part} labels={AREA_LABELS} /></p>
{/each}
