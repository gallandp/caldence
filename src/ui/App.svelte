<script lang="ts">
  import { locale } from '../i18n';
  import { onMount } from 'svelte';
  import { translate as t } from '../i18n';
  import { autosave } from './state/autosave';
  import { workspace } from './state/workspace';
  import Shell from './Shell.svelte';
  import './tokens.css';
  import './global.css';

  // The UI language is a workspace setting.
  $effect(() => {
    locale.set($workspace.settings.locale);
  });

  const { dirty, fileName } = workspace;
  let ready = $state(false);

  onMount(async () => {
    let timedOut = false;
    try {
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          autosave.disable();
          resolve(null);
        }, 3000),
      );
      const restored = await Promise.race([autosave.restore(), timeout]);
      if (restored && !timedOut) workspace.replace(restored.ws, restored);
    } catch {
      autosave.disable();
    } finally {
      ready = true;
    }
  });

  // Save every change (debounced) so a reload or crash restores the exact state.
  $effect(() => {
    if (ready) autosave.schedule({ ws: $workspace, fileName: $fileName, dirty: $dirty });
  });

  // A pending debounced write must not be lost when the page is hidden or closed.
  function flushNow() {
    void autosave.flush();
  }

  document.documentElement.lang = $locale;

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<svelte:window onpagehide={flushNow} />
<svelte:document onvisibilitychange={() => document.hidden && flushNow()} />

{#if ready}
  <Shell />
{:else}
  <p class="loading" role="status">{$t('app.loading')}</p>
{/if}

<style>
  .loading {
    padding: var(--space);
  }
</style>
