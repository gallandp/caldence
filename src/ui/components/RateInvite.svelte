<script lang="ts">
  import { tick } from 'svelte';
  import { updateSettings } from '../../core/edit';
  import { LIMITS } from '../../core/limits';
  import { parseRate } from '../rate';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

  /**
   * Shown where the cost card would be while the file has no hourly rate: costs stay hidden
   * (no "0 €"), but the rate can be set right here instead of a detour via Settings. After
   * Apply, the focus moves to the heading of the cost figures that replace this card.
   */
  let { focusAfter = '[data-costs] h3' }: { focusAfter?: string } = $props();
  const uid = $props.id();
  let value = $state('');
  let error = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const n = parseRate(value);
    if (n === null || !workspace.apply((ws) => updateSettings(ws, { hourlyRate: n })).ok) {
      error = true;
      return;
    }
    await tick();
    document.querySelector<HTMLElement>(focusAfter)?.focus();
  }
</script>

<section class="card invite" aria-labelledby="{uid}-title" data-rate-invite>
  <div class="text">
    <h3 id="{uid}-title">{$t('cost.title')}</h3>
    <p class="note">{$t('cost.invite.text')}</p>
  </div>
  <form onsubmit={submit} novalidate>
    <label for="{uid}-rate">{$t('settings.hourlyRate.unit')}</label>
    <span class="row">
      <input
        id="{uid}-rate"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        size="6"
        bind:value
        aria-invalid={error ? 'true' : undefined}
        aria-describedby="{uid}-scope{error ? ` ${uid}-err` : ''}"
        oninput={() => (error = false)}
      />
      <button type="submit" class="secondary">{$t('cost.invite.apply')}</button>
    </span>
    {#if error}
      <p class="field-error" id="{uid}-err" role="alert">
        {$t('cost.invite.error', { max: formatNumber($locale, LIMITS.hourlyRate, 0) })}
      </p>
    {/if}
    <p class="scope" id="{uid}-scope">{$t('cost.invite.scope')}</p>
  </form>
</section>

<style>
  .invite {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 2rem;
  }
  .text {
    flex: 1 1 18rem;
  }
  h3 {
    margin: 0 0 0.25rem;
  }
  .note {
    margin: 0;
    color: var(--text-muted);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  label {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  input {
    width: 6rem;
  }
  .scope {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .field-error {
    margin: 0;
  }
</style>
