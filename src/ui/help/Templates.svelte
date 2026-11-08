<script lang="ts">
  import { translate as t } from '../../i18n';
  import { shortcut } from './label';
  import Rich from './Rich.svelte';

  const parts = ['apply', 'import', 'export', 'people'] as const;
</script>

<section aria-labelledby="manual-templates">
  <h3 id="manual-templates">{$t('help.templates.title')}</h3>
  {#each parts as part (part)}
    <p>
      <Rich
        key={'help.templates.' + part}
        labels={{
          templates: 'view.templates',
          apply: 'templates.apply',
          teamName: 'templates.teamName',
          create: 'templates.create',
          open: 'templates.open',
          start: 'start.title',
          importButton: 'templates.import.button',
          preview: 'templates.preview',
          exportHeading: 'templates.export',
          team: 'templates.export.team',
          name: 'templates.export.name',
          exportButton: 'templates.export.button',
          settings: 'view.settings',
          teamView: 'view.team',
        }}
        keys={{ undo: $shortcut('undo') }}
      />
    </p>
  {/each}
</section>
