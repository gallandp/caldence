<script lang="ts">
  import { translate as t } from '../../i18n';

  const uid = $props.id();

  type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } };
  const platform =
    typeof navigator === 'undefined'
      ? ''
      : (navigator as NavigatorWithData).userAgentData?.platform || navigator.platform || '';
  const platformKind = /mac|iphone|ipad/i.test(platform) ? 'mac' : 'other';

  const steps = ['1', '2', '3', '4'] as const;
  const settingsFields = [
    'language',
    'region',
    'workdays',
    'hours',
    'horizon',
    'holidays',
    'thresholds',
    'roles',
    'people',
  ] as const;
  const teamFields = ['members', 'cadence', 'cycles', 'assumptions'] as const;
  const shortcuts = ['save', 'saveAs', 'open', 'undo'] as const;
  const templateParts = ['apply', 'import', 'export', 'people'] as const;
  const calendarApps = ['outlook', 'newOutlook', 'google', 'apple'] as const;
  const appSteps: Record<(typeof calendarApps)[number], number> = {
    outlook: 4,
    newOutlook: 4,
    google: 4,
    apple: 3,
  };
  const calendarKeys = ['arrows', 'homeEnd', 'page', 'enter'] as const;

  const keys = (id: (typeof shortcuts)[number]): string =>
    $t('help.keys.' + id, {
      mod: $t('help.key.mod.' + platformKind),
      shift: $t('help.key.shift.' + platformKind),
    });
</script>

<div class="help">
  <section aria-labelledby="{uid}-first">
    <h3 id="{uid}-first">{$t('help.first.title')}</h3>
    <ol>
      {#each steps as step (step)}
        <li>{$t('help.first.' + step)}</li>
      {/each}
    </ol>
    <p>{$t('help.first.example')}</p>
  </section>

  <section aria-labelledby="{uid}-where">
    <h3 id="{uid}-where">{$t('help.where.title')}</h3>
    <p>{$t('help.where.intro')}</p>
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
          {#each settingsFields as field (field)}
            <tr>
              <th scope="row">{$t('help.where.s.' + field)}</th>
              <td>{$t('help.where.col.settings')}</td>
            </tr>
          {/each}
          {#each teamFields as field (field)}
            <tr>
              <th scope="row">{$t('help.where.t.' + field)}</th>
              <td>{$t('help.where.col.team')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="{uid}-files">
    <h3 id="{uid}-files">{$t('help.files.title')}</h3>
    <p>{$t('help.files.format')}</p>
    <p>{$t('help.files.buttons')}</p>
    <p>{$t('help.files.fallback')}</p>
    <p>{$t('help.files.autosave')}</p>
    <p>{$t('help.files.privacy')}</p>
  </section>

  <section aria-labelledby="{uid}-templates">
    <h3 id="{uid}-templates">{$t('help.templates.title')}</h3>
    {#each templateParts as part (part)}
      <p>{$t('help.templates.' + part)}</p>
    {/each}
  </section>

  <section aria-labelledby="{uid}-ics">
    <h3 id="{uid}-ics">{$t('help.ics.title')}</h3>
    <p>{$t('help.ics.intro')}</p>
    {#each calendarApps as app (app)}
      <h4>{$t('help.ics.' + app + '.title')}</h4>
      <ol>
        {#each Array.from({ length: appSteps[app] }, (_, i) => i + 1) as n (n)}
          <li>{$t('help.ics.' + app + '.' + n)}</li>
        {/each}
      </ol>
    {/each}
    <p>{$t('help.ics.note')}</p>
  </section>

  <section aria-labelledby="{uid}-keys">
    <h3 id="{uid}-keys">{$t('help.keys.title')}</h3>
    <div class="scroll">
      <table>
        <caption class="sr-only">{$t('help.keys.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{$t('help.keys.col.keys')}</th>
            <th scope="col">{$t('help.keys.col.action')}</th>
          </tr>
        </thead>
        <tbody>
          {#each shortcuts as id (id)}
            <tr>
              <td><kbd>{keys(id)}</kbd></td>
              <td>{$t('help.keys.action.' + id)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="{uid}-cal">
    <h3 id="{uid}-cal">{$t('help.cal.title')}</h3>
    <div class="scroll">
      <table>
        <caption class="sr-only">{$t('help.cal.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{$t('help.keys.col.keys')}</th>
            <th scope="col">{$t('help.keys.col.action')}</th>
          </tr>
        </thead>
        <tbody>
          {#each calendarKeys as id (id)}
            <tr>
              <td><kbd>{$t('help.cal.' + id)}</kbd></td>
              <td>{$t('help.cal.action.' + id)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  .help {
    max-width: 48rem;
    min-width: 0;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: var(--surface);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  kbd {
    font-family: inherit;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: nowrap;
  }
</style>
