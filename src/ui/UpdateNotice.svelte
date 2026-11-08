<script lang="ts">
  import { translate as t } from '../i18n';
  import { update } from './state/update';

  const { needRefresh, offlineReady } = update;
</script>

<!-- The live region always exists, so screen readers announce text added to it. It floats over
     the page instead of pushing content down, so nothing moves under the pointer when it appears. -->
<div class="notice-region" role="status">
  {#if $needRefresh}
    <div class="notice">
      <span>{$t('update.available')}</span>
      <button type="button" onclick={() => update.reload()}>{$t('update.reload')}</button>
      <button type="button" onclick={() => update.dismiss()}>{$t('update.later')}</button>
    </div>
  {:else if $offlineReady}
    <div class="notice">
      <span>{$t('update.offline')}</span>
      <button type="button" onclick={() => update.dismiss()}>{$t('update.ok')}</button>
    </div>
  {/if}
</div>

<style>
  .notice-region {
    position: fixed;
    inset-inline: var(--space);
    bottom: var(--space);
    z-index: 10;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .notice {
    pointer-events: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--space) / 2);
    max-width: 40rem;
    padding: calc(var(--space) / 2) var(--space);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
  }
</style>
