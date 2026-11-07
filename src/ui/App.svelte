<script lang="ts">
  import { locale, LOCALE_STORAGE_KEY, type Locale } from '../i18n';
  import Shell from './Shell.svelte';
  import './tokens.css';
  import './global.css';

  // Restore a previously chosen language; storage may be unavailable.
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'de' || stored === 'en') locale.set(stored as Locale);
  } catch {
    /* no persistence available */
  }

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<Shell />
