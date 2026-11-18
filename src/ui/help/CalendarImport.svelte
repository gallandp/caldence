<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from './Rich.svelte';
  import { sectionLink } from './sections';

  const apps = ['outlook', 'newOutlook', 'google', 'apple'] as const;
  const appSteps: Record<(typeof apps)[number], number> = {
    outlook: 4,
    newOutlook: 4,
    google: 4,
    apple: 3,
  };
</script>

<section aria-labelledby="manual-ics">
  <h3 id="manual-ics" tabindex="-1">{$t('help.ics.title')}</h3>
  <p>
    <Rich
      key="help.ics.intro"
      labels={{ exchange: 'view.exchange', first: sectionLink('manual-first') }}
    />
  </p>
  <p>
    <Rich
      key="help.ics.areas"
      labels={{
        scope: 'exchange.export.scope',
        team: 'exchange.scope.team',
        zip: 'exchange.zip.button.team',
      }}
    />
  </p>
  <p>
    <Rich
      key="help.ics.remember"
      labels={{
        exchange: 'view.exchange',
        me: 'setup.me',
        toCalendar: 'meet.toCalendar',
        meetings: 'view.meetings',
      }}
    />
  </p>
  {#each apps as app (app)}
    <h4>{$t('help.ics.' + app + '.title')}</h4>
    <ol>
      {#each Array.from({ length: appSteps[app] }, (_, i) => i + 1) as n (n)}
        <li>{$t('help.ics.' + app + '.' + n)}</li>
      {/each}
    </ol>
  {/each}
  <p>{$t('help.ics.note')}</p>
</section>
