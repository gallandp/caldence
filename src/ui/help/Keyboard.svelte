<script lang="ts">
  import { translate as t } from '../../i18n';
  import { shortcut } from './label';

  const shortcuts = ['save', 'saveAs', 'open', 'undo'] as const;
  const calendarKeys = ['arrows', 'homeEnd', 'page', 'enter', 'escape'] as const;
</script>

<section aria-labelledby="manual-keys">
  <h3 id="manual-keys">{$t('help.keyboard.title')}</h3>
  <p>{$t('help.keyboard.intro')}</p>

  <h4>{$t('help.keys.title')}</h4>
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
            <td><kbd>{$shortcut(id)}</kbd></td>
            <td>{$t('help.keys.action.' + id)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h4>{$t('help.cal.title')}</h4>
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
