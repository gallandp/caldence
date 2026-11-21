<script lang="ts">
  import { translate as t } from '../../i18n';

  /** How to import an .ics file, per calendar app: one app at a time, picked in a segmented row. */
  const apps = ['outlook', 'newOutlook', 'google', 'apple'] as const;
  const appSteps: Record<(typeof apps)[number], number> = {
    outlook: 4,
    newOutlook: 4,
    google: 4,
    apple: 3,
  };
  let app = $state<(typeof apps)[number]>('outlook');
</script>

<section class="apps" aria-labelledby="help-apps-title">
  <h4 id="help-apps-title" tabindex="-1">{$t('help.ics.title')}</h4>
  <div class="segmented" role="group" aria-label={$t('help.apps.label')}>
    {#each apps as a (a)}
      <button type="button" aria-pressed={app === a} onclick={() => (app = a)}>
        {$t('help.ics.' + a + '.title')}
      </button>
    {/each}
  </div>
  <ol>
    {#each Array.from({ length: appSteps[app] }, (_, i) => i + 1) as n (app + n)}
      <li>{$t('help.ics.' + app + '.' + n)}</li>
    {/each}
  </ol>
</section>

<style>
  h4 {
    font-size: 1.05rem;
  }
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    max-width: 100%;
  }
  ol {
    margin: 0.75rem 0 0;
    padding-left: 1.4rem;
  }
  li {
    padding: 0.15rem 0;
  }
</style>
