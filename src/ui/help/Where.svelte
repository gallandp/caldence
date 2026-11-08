<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from './Rich.svelte';

  /** Each value with the view it is edited in; the labels are the ones these views show. */
  const rows: { label: string; view: 'settings' | 'team' | 'meetings' }[] = [
    { label: 'lang.label', view: 'settings' },
    { label: 'settings.region', view: 'settings' },
    { label: 'settings.timezone', view: 'settings' },
    { label: 'settings.hoursPerWeek', view: 'settings' },
    { label: 'settings.workdays', view: 'settings' },
    { label: 'settings.horizon', view: 'settings' },
    { label: 'settings.skipHolidays', view: 'settings' },
    { label: 'settings.thresholds', view: 'settings' },
    { label: 'settings.roles', view: 'settings' },
    { label: 'settings.people', view: 'settings' },
    { label: 'team.members', view: 'team' },
    { label: 'team.cadence', view: 'team' },
    { label: 'team.cycles', view: 'team' },
    { label: 'team.assumptions', view: 'team' },
    { label: 'meet.categories', view: 'meetings' },
  ];
</script>

<section aria-labelledby="manual-where">
  <h3 id="manual-where">{$t('help.where.title')}</h3>
  <p>
    <Rich
      key="help.where.intro"
      labels={{
        settings: 'view.settings',
        team: 'view.team',
        meetings: 'view.meetings',
        assumptions: 'team.assumptions',
      }}
    />
  </p>
  <div class="scroll">
    <table>
      <caption class="sr-only">{$t('help.where.caption')}</caption>
      <thead>
        <tr>
          <th scope="col">{$t('help.where.col.field')}</th>
          <th scope="col">{$t('help.where.col.where')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.label)}
          <tr>
            <th scope="row">{$t(row.label)}</th>
            <td>{$t('view.' + row.view)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
