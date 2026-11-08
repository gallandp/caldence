<script lang="ts">
  import { translate as t } from '../i18n';
  import { update } from './state/update';

  const { needRefresh, offlineReady } = update;
</script>

<!-- The live region always exists, so screen readers announce text added to it.
     "Works offline" is only announced: showing it would push the page down or cover controls
     on every first visit. A new version is rare and needs a choice, so it is shown. -->
<div role="status">
  {#if $needRefresh}
    <div class="notice">
      <span>{$t('update.available')}</span>
      <button type="button" onclick={() => update.reload()}>{$t('update.reload')}</button>
      <button type="button" onclick={() => update.dismiss()}>{$t('update.later')}</button>
    </div>
  {:else if $offlineReady}
    <span class="sr-only">{$t('update.offline')}</span>
  {/if}
</div>

<style>
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--space) / 2);
    padding: calc(var(--space) / 2) var(--space);
    background: var(--surface);
    color: var(--text);
    border-bottom: 1px solid var(--border);
  }
</style>
