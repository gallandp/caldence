<script lang="ts">
  import { locale } from '../i18n';
  import { onMount } from 'svelte';
  import { translate as t } from '../i18n';
  import { autosave, restoreWithTimeout } from './state/autosave';
  import { workspace } from './state/workspace';
  import Shell from './Shell.svelte';
  import './tokens.css';
  import './global.css';

  // The UI language is a workspace setting.
  $effect(() => {
    locale.set($workspace.settings.locale);
  });

  const { dirty, fileName, version } = workspace;
  let ready = $state(false);

  onMount(async () => {
    try {
      const restored = await restoreWithTimeout(autosave);
      if (restored) workspace.replace(restored.ws, restored);
    } finally {
      ready = true;
    }
  });

  // Save every change (debounced) so a reload or crash restores the exact state.
  // Transitions (file name, saved, replaced workspace) are written at once.
  let last: { fileName: string | null; dirty: boolean; version: number } | undefined;
  $effect(() => {
    const next = { fileName: $fileName, dirty: $dirty, version: $version };
    if (!ready) return;
    const immediate =
      last !== undefined &&
      (last.fileName !== next.fileName ||
        (last.dirty && !next.dirty) ||
        last.version !== next.version);
    last = next;
    autosave.schedule(
      { ws: $workspace, fileName: next.fileName, dirty: next.dirty },
      { immediate },
    );
  });

  // A pending debounced write must not be lost when the page is hidden or closed.
  function flushNow() {
    autosave.flushNow();
  }

  document.documentElement.lang = $locale;

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<svelte:window onpagehide={flushNow} onbeforeunload={flushNow} />
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
