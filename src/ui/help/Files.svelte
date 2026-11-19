<script lang="ts">
  import { translate as t } from '../../i18n';
  import Rich from './Rich.svelte';

  const parts = [
    'format',
    'areas',
    'buttons',
    'status',
    'fallback',
    'autosave',
    'excel',
    'privacy',
    'staff',
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
    print: 'file.print',
    exchange: 'view.exchange',
    excel: 'exchange.xlsx.button',
    staff: 'staff.open',
    overview: 'area.view.overview',
    calendar: 'view.calendar',
  };
</script>

{#each parts as part (part)}
  <!-- The staff import links here (#330); tabindex -1 only takes focus from script. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <p
    id={part === 'staff' ? 'help-staff-privacy' : undefined}
    tabindex={part === 'staff' ? -1 : undefined}
  >
    <Rich key={'help.files.' + part} {labels} />
  </p>
{/each}
<h4>{$t('help.install.title')}</h4>
{#each installParts as part (part)}
  <p><Rich key={'help.install.' + part} {labels} /></p>
{/each}
