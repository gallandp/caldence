<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from '../help/Rich.svelte';
  import AreaIcon from './AreaIcon.svelte';

  /** Offered once per workspace with two or more teams and no area. */
  let { onGroup, onDismiss }: { onGroup: () => void; onDismiss: () => void } = $props();

  const uid = $props.id();
</script>

<section class="group-hint" aria-labelledby="{uid}-h">
  <span class="mark"><AreaIcon /></span>
  <div class="body">
    <h3 id="{uid}-h">{$t('area.hint.title')}</h3>
    <p><Rich key="area.hint.text" labels={{ add: 'area.add' }} /></p>
    <div class="buttons">
      <button type="button" class="primary" onclick={onGroup}>{$t('area.hint.group')}</button>
      <button type="button" onclick={onDismiss}>{$t('area.hint.dismiss')}</button>
    </div>
  </div>
</section>

<style>
  .group-hint {
    display: flex;
    gap: 0.9rem;
    margin-bottom: 1.25rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--area-line, var(--border));
    border-radius: var(--radius-lg);
    background: var(--area-soft);
  }
  .mark {
    display: inline-flex;
    padding-top: 0.15rem;
    color: var(--area);
    font-size: 1.35rem;
  }
  .body {
    min-width: 0;
  }
  h3 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
  }
  p {
    margin: 0 0 0.75rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
