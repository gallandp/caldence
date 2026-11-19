<script lang="ts">
  import { shortcut } from './label';
  import Rich from './Rich.svelte';

  const parts = ['apply', 'import', 'export', 'people', 'mix'] as const;
</script>

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
        teamView: 'view.team',
        settingsLevels: 'settings.levels.choice',
        chooseTeams: 'area.teams',
        roleLinks: 'area.roleLinks.title',
      }}
      keys={{ undo: $shortcut('undo') }}
    />
  </p>
{/each}
