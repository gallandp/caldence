<script lang="ts">
  import Rich from './Rich.svelte';
  import { topicLink } from './topics';

  const labels = {
    duration: 'meet.duration',
    scale: 'meet.scaling.enable',
    base: 'meet.scaling.base',
    perUnit: 'meet.scaling.perUnit',
    assumption: 'meet.scaling.assumption',
    grid: 'meet.scaling.grid',
    participants: 'meet.participants',
    share: 'meet.participants.share',
    named: 'meet.people',
    prep: 'meet.prep',
    onSite: 'meet.place.onSite',
    travel: 'meet.travel',
    skip: 'settings.skipHolidays',
    baseTable: 'load.table.base',
    roleTable: 'load.summary',
    personTable: 'load.table.person',
    hpw: 'settings.hoursPerWeek',
    hours: 'team.members.hours',
    fte: 'load.col.fte',
    room: 'load.col.free',
    warnings: 'load.warnings',
    hints: 'load.hints',
    setHours: 'area.participants.setHours',
    structure: 'area.view.structure',
    areaOnly: 'area.group.areaOnly',
    warnFactor: 'settings.warnFactor',
    maxFte: 'settings.maxFte',
    thresholds: 'settings.thresholds',
    settings: 'view.settings',
    hourlyRate: 'settings.hourlyRate',
    costs: 'cost.title',
    areas: topicLink('areas'),
    overview: 'area.view.overview',
    teamShare: 'overview.cost.col.share',
    avg: 'overview.avg',
    loadTile: 'overview.kpi.load',
    areaRow: 'overview.cost.areaRow',
  };
  const parts = [
    'duration',
    'share',
    'travel',
    'members',
    'named',
    'holidays',
    'base',
    'average',
    'fte',
    'warn',
    'cost',
    'areaShare',
    'areas',
    'overview',
  ] as const;
</script>

<ul>
  {#each parts as part (part)}
    <li><Rich key={'help.calc.' + part} {labels} /></li>
  {/each}
</ul>
