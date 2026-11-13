<script lang="ts">
  import { translate as t } from '../../i18n';
  import { shortcut } from './label';
  import Rich from './Rich.svelte';
  import { sectionLink } from './sections';

  const regionParts = ['intro', 'import', 'remove', 'warn'] as const;
</script>

<section aria-labelledby="manual-views">
  <h3 id="manual-views">{$t('help.views.title')}</h3>
  <p>
    <Rich
      key="help.views.intro"
      labels={{
        new: 'file.new',
        open: 'file.open',
        save: 'file.save',
        saveAs: 'file.saveAs',
        team: 'team.switcher.label',
        actions: 'team.actions',
        plan: 'setup.another',
        addTeam: 'team.add',
        rename: 'team.rename',
        duplicate: 'team.duplicate',
        delete: 'team.delete',
        role: 'filter.role',
        person: 'filter.person',
      }}
    />
  </p>
  <p>
    <Rich
      key="help.views.filters"
      labels={{
        calendar: 'view.calendar',
        load: 'view.load',
        role: 'filter.role',
        person: 'filter.person',
        all: 'filter.all',
      }}
    />
  </p>

  <h4>{$t('view.calendar')}</h4>
  <p>
    <Rich
      key="help.views.calendar"
      labels={{
        month: 'cal.mode.month',
        week: 'cal.mode.week',
        range: 'cal.mode.range',
        today: 'cal.today',
        prev: 'cal.prev.month',
        next: 'cal.next.month',
        prevWeek: 'cal.prev.week',
        nextWeek: 'cal.next.week',
      }}
    />
    {$t('help.views.calendar.legend')}
  </p>
  <p>
    <Rich
      key="help.views.day"
      labels={{ skip: 'settings.skipHolidays', close: 'cal.day.close', edit: 'meet.edit' }}
    />
  </p>

  <p>
    <Rich
      key="help.views.weeks"
      labels={{
        range: 'cal.mode.range',
        total: 'weeks.col.total',
        current: 'weeks.current',
        warn: 'weeks.show.warn',
        cadence: 'weeks.show.cadence',
      }}
    />
  </p>

  <h4>{$t('view.load')}</h4>
  <p>
    <Rich
      key="help.views.load"
      labels={{
        base: 'load.table.base',
        role: 'load.summary',
        chart: 'load.chart',
        hpw: 'settings.hoursPerWeek',
        person: 'load.table.person',
        warnings: 'load.warnings',
        calc: sectionLink('manual-calc'),
      }}
    />
  </p>

  <h4>{$t('view.meetings')}</h4>
  <p>
    <Rich
      key="help.views.meetings"
      labels={{
        cadence: 'team.cadence',
        change: 'meet.cadence.edit',
        sprint: 'team.cadence.kind.sprint',
        flow: 'team.cadence.kind.flow',
        pi: 'team.cadence.kind.pi',
        cycles: 'team.cycles',
        add: 'meet.add',
        edit: 'meet.edit',
        duplicate: 'meet.duplicate',
        delete: 'meet.delete',
        scale: 'meet.scaling.enable',
        categories: 'meet.categories',
      }}
    />
  </p>
  <p>
    <Rich
      key="help.views.rules"
      labels={{
        repeats: 'meet.ruletype',
        weekly: 'meet.ruletype.weekly',
        weekdays: 'meet.ruletype.weekdays',
        everyN: 'meet.ruletype.every-n-weeks',
        monthly: 'meet.ruletype.monthly-nth-weekday',
        cadenceDay: 'meet.ruletype.cadence-day',
        milestone: 'meet.ruletype.cycle-milestone',
        once: 'meet.ruletype.once',
      }}
    />
  </p>

  <h4>{$t('view.team')}</h4>
  <p>
    <Rich
      key="help.views.team"
      labels={{
        members: 'team.members',
        hours: 'team.members.hours',
        shared: 'team.shared',
        people: 'settings.people',
        roles: 'settings.roles',
        assumptions: 'team.assumptions',
      }}
    />
  </p>

  <h4>{$t('view.settings')}</h4>
  <p>
    <Rich
      key="help.views.settings"
      labels={{
        general: 'settings.general',
        language: 'lang.label',
        region: 'settings.region',
        timezone: 'settings.timezone',
        hpw: 'settings.hoursPerWeek',
        workdays: 'settings.workdays',
        horizon: 'settings.horizon',
        skip: 'settings.skipHolidays',
        thresholds: 'settings.thresholds',
      }}
    />
  </p>
  <h5>{$t('help.region.title')}</h5>
  {#each regionParts as part (part)}
    <p>
      <Rich
        key={'help.region.' + part}
        labels={{
          region: 'settings.region',
          import: 'settings.region.import',
          remove: { key: 'settings.region.remove', params: { name: '…' } },
          horizon: 'settings.horizon',
          settings: 'view.settings',
          weeks: 'cal.mode.range',
        }}
        keys={{ undo: $shortcut('undo') }}
      />
    </p>
  {/each}

  <h4>{$t('view.templates')}</h4>
  <p>
    <Rich
      key="help.views.templates"
      labels={{ builtin: 'templates.builtin', more: sectionLink('manual-templates') }}
    />
  </p>

  <h4>{$t('view.exchange')}</h4>
  <p>
    <Rich
      key="help.views.export"
      labels={{
        export: 'exchange.export',
        scope: 'exchange.export.scope',
        from: 'exchange.export.from',
        to: 'exchange.export.to',
        reminder: 'exchange.export.reminder',
        include: 'exchange.export.include',
        button: 'exchange.export.button',
      }}
    />
  </p>
  <p>
    <Rich
      key="help.views.import"
      labels={{
        import: 'exchange.import',
        button: 'exchange.import.button',
        team: 'exchange.import.team',
        roles: 'exchange.import.roles',
        duplicate: 'exchange.duplicate',
        skipped: 'exchange.skipped',
      }}
    />
  </p>
</section>
