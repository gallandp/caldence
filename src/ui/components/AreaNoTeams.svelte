<script lang="ts">
  import { tick } from 'svelte';
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import AreaDialog from '../AreaDialog.svelte';

  /**
   * An area without teams: says so and offers to choose them right here (#254).
   * `focusAfter` is a selector for where focus goes once teams were chosen and this is gone.
   */
  let { area, focusAfter }: { area: Area; focusAfter: string } = $props();

  let button: HTMLButtonElement | undefined = $state();
  let dialog: AreaDialog | undefined = $state();

  async function returnFocus() {
    await tick();
    if (button?.isConnected) button.focus();
    else document.querySelector<HTMLElement>(focusAfter)?.focus();
  }
</script>

<div class="no-teams">
  <p>{$t('area.empty.teams', { name: area.name })}</p>
  <button type="button" class="primary" bind:this={button} onclick={() => dialog?.show(area)}>
    {$t('area.teams')}
  </button>
</div>
<AreaDialog bind:this={dialog} {returnFocus} />

<style>
  .no-teams p {
    margin: 0 0 0.6rem;
  }
</style>
