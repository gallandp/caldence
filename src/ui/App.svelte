<script lang="ts">
  import { locale } from '../i18n';
  import { workspace } from './state/workspace';
  import Shell from './Shell.svelte';
  import './tokens.css';
  import './global.css';

  // The UI language is a workspace setting.
  $effect(() => {
    locale.set($workspace.settings.locale);
  });

  document.documentElement.lang = $locale;

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<Shell />
