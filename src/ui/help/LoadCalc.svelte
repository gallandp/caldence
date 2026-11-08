<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from './Rich.svelte';

  const labels = {
    duration: 'meet.duration',
    scale: 'meet.scaling.enable',
    base: 'meet.scaling.base',
    perUnit: 'meet.scaling.perUnit',
    assumption: 'meet.scaling.assumption',
    grid: 'meet.scaling.grid',
    participants: 'meet.participants',
    share: 'meet.participants.share',
    prep: 'meet.prep',
    skip: 'settings.skipHolidays',
    baseTable: 'load.table.base',
    roleTable: 'load.table.role',
    personTable: 'load.table.person',
    hpw: 'settings.hoursPerWeek',
    hours: 'settings.people.hoursLabel',
    fte: 'load.col.fte',
    warnings: 'load.warnings',
    warnFactor: 'settings.warnFactor',
    maxFte: 'settings.maxFte',
    thresholds: 'settings.thresholds',
    settings: 'view.settings',
  };
  const parts = [
    'duration',
    'share',
    'members',
    'holidays',
    'base',
    'average',
    'fte',
    'warn',
  ] as const;
</script>

<section aria-labelledby="manual-calc">
  <h3 id="manual-calc">{$t('help.calc.title')}</h3>
  <ul>
    {#each parts as part (part)}
      <li><Rich key={'help.calc.' + part} {labels} /></li>
    {/each}
  </ul>
  <p>{$t('help.calc.example')}</p>
</section>
