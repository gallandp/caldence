<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from './Rich.svelte';

  const parts = [
    'format',
    'buttons',
    'status',
    'present',
    'fallback',
    'autosave',
    'privacy',
  ] as const;
  const installParts = ['install', 'update'] as const;
  const labels = {
    new: 'file.new',
    open: 'file.open',
    save: 'file.save',
    saveAs: 'file.saveAs',
    untitled: 'file.untitled',
    unsaved: 'file.unsaved',
    saved: 'file.saved',
    autosaveOff: 'file.autosaveOff',
    available: 'update.available',
    reload: 'update.reload',
    later: 'update.later',
    present: 'file.present',
    stop: 'file.present.stop',
    hideNames: 'present.hideNames',
    reset: 'whatif.reset',
  };
</script>

<section aria-labelledby="manual-files">
  <h3 id="manual-files">{$t('help.files.title')}</h3>
  {#each parts as part (part)}
    <p><Rich key={'help.files.' + part} {labels} /></p>
  {/each}
  <h4>{$t('help.install.title')}</h4>
  {#each installParts as part (part)}
    <p><Rich key={'help.install.' + part} {labels} /></p>
  {/each}
</section>
