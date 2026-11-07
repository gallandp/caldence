<script lang="ts">
  import { translate as t, locale, type Locale } from '../i18n';
  import { updateSettings } from '../core/edit';
  import { workspace } from './state/workspace';

  const options: Locale[] = ['de', 'en'];

  function onChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as Locale;
    workspace.apply((ws) => updateSettings(ws, { locale: value }));
  }
</script>

<label class="lang">
  <span>{$t('lang.label')}</span>
  <select value={$locale} onchange={onChange}>
    {#each options as option (option)}
      <option value={option} lang={option}>{$t('lang.name.' + option)}</option>
    {/each}
  </select>
</label>

<style>
  .lang {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.25rem 0.5rem;
  }
</style>
