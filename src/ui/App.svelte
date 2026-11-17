<script lang="ts">
  import { levels, locale } from '../i18n';
  import { onMount } from 'svelte';
  import { levelWords } from '../i18n/levels';
  import { translate as t } from '../i18n';
  import { autosave, restoreWithTimeout, wantsReset } from './state/autosave';
  import { workspace } from './state/workspace';
  import Shell from './Shell.svelte';
  import UpdateNotice from './UpdateNotice.svelte';
  import './tokens.css';
  import './global.css';
  import './theme.css';
  import './print.css';

  // The UI language is a workspace setting.
  // The UI language and the level names are workspace settings. Derived first, so that an edit
  // elsewhere in the workspace does not rebuild every translated text.
  const uiLocale = $derived($workspace.settings.locale);
  const levelKey = $derived(JSON.stringify($workspace.settings.levelNames ?? null));
  $effect(() => locale.set(uiLocale));
  $effect(() => {
    const names = JSON.parse(levelKey) as Parameters<typeof levelWords>[0] | null;
    levels.set(levelWords(names ?? undefined, uiLocale));
  });

  const { dirty, fileName, version, presentBase } = workspace;
  let ready = $state(false);

  onMount(async () => {
    try {
      if (wantsReset(location.href)) {
        await autosave.reset();
        // A reload must not reset again.
        const url = new URL(location.href);
        url.searchParams.delete('reset');
        history.replaceState(history.state, '', url);
        return;
      }
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
    // What-ifs while presenting are never stored: a reload brings back the state from before.
    if (!ready || $presentBase) return;
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

<UpdateNotice />

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
