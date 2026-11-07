<script lang="ts">
  import { translate as t } from '../i18n';
  import { APP_VERSION } from '../version';
</script>

<main>
  <h1>{$t('app.name')}</h1>
  <p>{$t('app.version', { version: APP_VERSION })}</p>
</main>
