<script lang="ts">
  import { translate as t } from '../../i18n';
  import { AREA_LABELS, AREA_PARTS } from './areas';
  import Rich from './Rich.svelte';
</script>

<section aria-labelledby="manual-areas">
  <h3 id="manual-areas">{$t('help.areas.title')}</h3>
  {#each AREA_PARTS as part (part)}
    <p><Rich key={'help.areas.' + part} labels={AREA_LABELS} /></p>
  {/each}
</section>
