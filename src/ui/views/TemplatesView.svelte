<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { slug } from '../../core/slug';
  import { applyTemplate, loadTemplate, teamToTemplate, type Template } from '../../core/template';
  import { BUILTIN_TEMPLATES, builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { locale, translate as t } from '../../i18n';
  import {
    browserFileEnv,
    exportTextFile,
    openTextFile,
    type FilePickerType,
  } from '../state/files';
  import { pickFile } from '../state/picker';
  import ApplyDialog from '../templates/ApplyDialog.svelte';
  import { activeTeamId, localToday, workspace } from '../state/workspace';

  let { onOpenTeam }: { onOpenTeam?: () => void } = $props();

  const uid = $props.id();
  const env = browserFileEnv((accept) => pickFile(accept ?? '.json,application/json'));
  const types = (): FilePickerType[] => [
    { description: $t('templates.file.type'), accept: { 'application/json': ['.json'] } },
  ];

  const builtins = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateId[];
  const teams = $derived($workspace.teams);

  type Problem = { key: string; path?: string };
  let created = $state<string | null>(null);
  let problem = $state<Problem | null>(null);
  let exported = $state<string | null>(null);

  let applyDialog: ApplyDialog | undefined;

  // Import
  let imported = $state.raw<Template | null>(null);
  let importName = $state('');
  let importError = $state(false);

  let openButton = $state<HTMLButtonElement | undefined>();

  function create(template: Template, name: string): boolean {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    const result = workspace.apply((ws) =>
      applyTemplate(ws, template, { name: trimmed, today: localToday() }),
    );
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      return false;
    }
    problem = null;
    exported = null;
    if (result.id) activeTeamId.set(result.id);
    created = trimmed;
    // The control that was used is gone or inert now: move focus to the outcome.
    void tick().then(() => openButton?.focus());
    return true;
  }

  function onApplied(name: string) {
    problem = null;
    exported = null;
    created = name;
    // The control that was used is gone or inert now: move focus to the outcome.
    void tick().then(() => openButton?.focus());
  }

  async function importFile() {
    let file;
    try {
      file = await openTextFile(env, types());
    } catch {
      problem = { key: 'file.error.read' };
      imported = null;
      return;
    }
    if (!file) return;
    const loaded = loadTemplate(file.text);
    if (!loaded.ok) {
      const first = loaded.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      imported = null;
      return;
    }
    problem = null;
    created = null;
    imported = loaded.value;
    importName = loaded.value.name;
    importError = false;
  }

  function submitImport(event: SubmitEvent) {
    event.preventDefault();
    if (!imported) return;
    if (importName.trim() === '') {
      importError = true;
      (document.getElementById(`${uid}-import-name`) as HTMLInputElement | null)?.focus();
      return;
    }
    if (create(imported, importName)) imported = null;
  }

  // Export
  let chosenTeam = $state<string | null>(null);
  let nameDraft = $state<string | null>(null);
  let exportError = $state(false);
  const exportTeam = $derived(
    teams.find((x) => x.id === (chosenTeam ?? $activeTeamId)) ?? teams[0],
  );
  const exportName = $derived(nameDraft ?? exportTeam?.name ?? '');

  async function exportFile(event: SubmitEvent) {
    event.preventDefault();
    const team = exportTeam;
    if (!team) return;
    const name = exportName.trim();
    if (name === '') {
      exportError = true;
      return;
    }
    exportError = false;
    const id = slug(name);
    const template = teamToTemplate(get(workspace), team.id, { id, name, description: '' });
    try {
      const saved = await exportTextFile(
        env,
        `${id}.caldence-template.json`,
        JSON.stringify(template, null, 2) + '\n',
        types(),
      );
      if (saved === null) return;
      problem = null;
      created = null;
      exported = saved;
    } catch {
      problem = { key: 'file.error.write' };
    }
  }
</script>

<div class="templates">
  <p class="help">{$t('templates.help')}</p>

  <div role="status" class="notice">
    {#if created}
      <span>{$t('templates.created', { name: created })}</span>
      <button type="button" bind:this={openButton} onclick={() => onOpenTeam?.()}
        >{$t('templates.open')}</button
      >
    {:else if exported}
      {$t('templates.exported', { name: exported })}
    {/if}
  </div>
  <div role="alert" class="error">
    {#if problem}{$t(problem.key, { path: problem.path ?? '' })}{/if}
  </div>

  <section aria-labelledby="{uid}-builtin-h">
    <h3 id="{uid}-builtin-h">{$t('templates.builtin')}</h3>
    <div class="cards">
      {#each builtins as id (id)}
        {@const template = builtinTemplate(id, $locale)}
        <article aria-labelledby="{uid}-{id}-h">
          <h4 id="{uid}-{id}-h">{template.name}</h4>
          <p>{template.description}</p>
          <button type="button" class="primary" onclick={() => applyDialog?.show(id)}
            >{$t('templates.apply')}</button
          >
        </article>
      {/each}
    </div>
  </section>

  <section aria-labelledby="{uid}-import-h">
    <h3 id="{uid}-import-h">{$t('templates.import')}</h3>
    <button type="button" onclick={importFile}>{$t('templates.import.button')}</button>
    {#if imported}
      <section class="preview" aria-labelledby="{uid}-preview-h">
        <h4 id="{uid}-preview-h">{$t('templates.preview')}</h4>
        <p><strong>{imported.name}</strong></p>
        <p>{imported.description}</p>
        <ul>
          <li>{$t('templates.preview.roles', { count: imported.roles.length })}</li>
          <li>{$t('templates.preview.categories', { count: imported.categories.length })}</li>
          <li>{$t('templates.preview.events', { count: imported.team.events.length })}</li>
          <li>
            {$t('templates.preview.cadence', {
              kind: $t('team.cadence.kind.' + imported.team.cadence.kind),
              weeks: imported.team.cadence.lengthWeeks,
            })}
          </li>
        </ul>
        <form class="row" onsubmit={submitImport}>
          <div class="field grow">
            <label for="{uid}-import-name">{$t('templates.teamName')}</label>
            <input
              id="{uid}-import-name"
              type="text"
              bind:value={importName}
              aria-invalid={importError ? 'true' : undefined}
              aria-describedby={importError ? `${uid}-import-err` : undefined}
              oninput={() => (importError = false)}
            />
          </div>
          <button type="submit" class="primary">{$t('templates.create')}</button>
        </form>
        {#if importError}
          <p class="field-error" id="{uid}-import-err">{$t('templates.error.name')}</p>
        {/if}
      </section>
    {/if}
  </section>

  <section aria-labelledby="{uid}-export-h">
    <h3 id="{uid}-export-h">{$t('templates.export')}</h3>
    {#if teams.length === 0}
      <p class="empty">{$t('templates.export.none')}</p>
    {:else}
      <p class="empty">{$t('templates.export.hint')}</p>
    {/if}
    <form class="row" onsubmit={exportFile}>
      <div class="field">
        <label for="{uid}-export-team">{$t('templates.export.team')}</label>
        <select
          id="{uid}-export-team"
          disabled={teams.length === 0}
          value={exportTeam?.id ?? ''}
          onchange={(e) => {
            chosenTeam = e.currentTarget.value;
            nameDraft = null;
            exportError = false;
          }}
        >
          {#each teams as team (team.id)}
            <option value={team.id}>{team.name}</option>
          {/each}
        </select>
      </div>
      <div class="field grow">
        <label for="{uid}-export-name">{$t('templates.export.name')}</label>
        <input
          id="{uid}-export-name"
          type="text"
          disabled={teams.length === 0}
          value={exportName}
          aria-invalid={exportError ? 'true' : undefined}
          aria-describedby={exportError ? `${uid}-export-err` : undefined}
          oninput={(e) => {
            nameDraft = e.currentTarget.value;
            exportError = false;
          }}
        />
      </div>
      <button type="submit" disabled={teams.length === 0}>{$t('templates.export.button')}</button>
    </form>
    {#if exportError}
      <p class="field-error" id="{uid}-export-err">{$t('templates.error.name')}</p>
    {/if}
  </section>
</div>

<ApplyDialog bind:this={applyDialog} oncreated={onApplied} />

<style>
  .help,
  .empty {
    color: var(--text-muted);
  }
  section {
    margin-block: calc(var(--space) * 1.5);
  }
  h3 {
    margin-bottom: 0.5rem;
  }
  h4 {
    margin: 0 0 0.25rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space);
  }
  article,
  .preview {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space);
    background: var(--surface);
  }
  article p {
    margin-top: 0;
  }
  .preview {
    margin-top: var(--space);
  }
  .preview ul {
    margin: 0 0 var(--space);
    padding-left: 1.25rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 1rem;
    margin-block: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .grow {
    flex: 1 1 12rem;
  }
  .notice {
    min-height: 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  /* An empty live region takes no room; it stays in the tree so its message is announced. */
  .notice:empty {
    min-height: 0;
  }
  .error,
  .field-error {
    color: var(--danger);
  }
  .field-error {
    margin: 0.25rem 0 0;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  input,
  select {
    max-width: 100%;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
  }
</style>
