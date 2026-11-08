<script lang="ts">
  import { translate as t } from '../i18n';
  import { update } from './state/update';

  const { needRefresh, offlineReady } = update;
</script>

{#if $needRefresh}
  <div class="notice" role="status">
    <span>{$t('update.available')}</span>
    <button type="button" onclick={() => update.reload()}>{$t('update.reload')}</button>
    <button type="button" onclick={() => update.dismiss()}>{$t('update.later')}</button>
  </div>
{:else if $offlineReady}
  <div class="notice" role="status">
    <span>{$t('update.offline')}</span>
    <button type="button" onclick={() => update.dismiss()}>{$t('update.ok')}</button>
  </div>
{/if}

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
