<script lang="ts">
  import { translate as t } from '../../i18n';

  const uid = $props.id();

  type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } };
  const platform =
    typeof navigator === 'undefined'
      ? ''
      : ((navigator as NavigatorWithData).userAgentData?.platform ?? navigator.platform ?? '');
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
        <caption>{$t('help.where.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{$t('help.where.col.settings')}</th>
            <th scope="col">{$t('help.where.col.team')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <ul>
                {#each settingsFields as field (field)}
                  <li>{$t('help.where.s.' + field)}</li>
                {/each}
              </ul>
            </td>
            <td>
              <ul>
                {#each teamFields as field (field)}
                  <li>{$t('help.where.t.' + field)}</li>
                {/each}
              </ul>
            </td>
          </tr>
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

  <section aria-labelledby="{uid}-keys">
    <h3 id="{uid}-keys">{$t('help.keys.title')}</h3>
    <div class="scroll">
      <table>
        <caption>{$t('help.keys.caption')}</caption>
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
        <caption>{$t('help.cal.caption')}</caption>
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
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
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
  ul {
    margin: 0;
    padding-left: 1.25rem;
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
