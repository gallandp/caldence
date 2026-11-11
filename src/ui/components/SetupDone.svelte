<script lang="ts">
  import { translate as t } from '../../i18n';

  let {
    onMeetings,
    onShare,
    onClose,
  }: { onMeetings: () => void; onShare: () => void; onClose: () => void } = $props();

  const uid = $props.id();
</script>

<section class="done" aria-labelledby="{uid}-h">
  <h3 id="{uid}-h">{$t('setup.done.title')}</h3>
  <p>{$t('setup.done.text')}</p>
  <p class="hint">{$t('setup.done.save')}</p>
  <div class="buttons">
    <button type="button" class="primary" onclick={onMeetings}>{$t('setup.done.meetings')}</button>
    <button type="button" onclick={onShare}>{$t('setup.done.share')}</button>
    <button type="button" onclick={onClose}>{$t('setup.done.close')}</button>
  </div>
</section>

<style>
  .done {
    margin-bottom: 1.25rem;
    padding: 1.25rem 1.5rem;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(80% 120% at 100% 0%, rgb(139 123 255 / 0.18), transparent 60%), var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }
  .hint {
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
