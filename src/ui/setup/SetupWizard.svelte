<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { setupTeam, type SetupMember } from '../../core/setup';
  import type { Template } from '../../core/template';
  import { BUILTIN_TEMPLATES, builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { locale, translate as t } from '../../i18n';
  import { resolveRegion } from '../../core/regions';
  import { regionIds } from '../../data/regions';
  import { activeTeamId, localToday, workspace } from '../state/workspace';
  import { browserZone, FALLBACK_ZONES, supportedZones } from '../state/zones';

  /** Called once the team was created and the dialog is closed. */
  let { oncreated }: { oncreated?: (name: string) => void } = $props();

  const uid = $props.id();
  const ids = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateId[];

  let dialog: HTMLDialogElement | undefined;
  let heading = $state<HTMLElement>();
  let nameInput = $state<HTMLInputElement>();
  let step = $state(1);
  let choice = $state<BuiltinTemplateId | 'none'>('scrum');
  /** The way of working the later steps were filled for; a different choice starts them afresh. */
  let filledFor: BuiltinTemplateId | 'none' | null = null;
  let name = $state('');
  let start = $state('');
  let names = $state<Record<string, string>>({});
  let me = $state(false);
  let myName = $state('');
  let myRole = $state('');
  let timezone = $state('');
  let region = $state('');
  let from = $state('');
  let to = $state('');
  /** The first team also confirms the workspace frame: time zone, region and horizon. */
  let withFrame = $state(true);
  let nameError = $state(false);
  let problem = $state<{ key: string; path?: string } | null>(null);

  const template = $derived<Template | null>(
    choice === 'none' ? null : builtinTemplate(choice, $locale),
  );
  const roles = $derived(template ? template.roles : $workspace.roles);
  const steps = $derived(withFrame ? 4 : 3);
  /** People of the workspace; a name entered again is the same person. */
  const known = $derived($workspace.people.map((p) => p.name));
  const zones = supportedZones();
  const zoneOptions = $derived(
    zones && timezone !== '' && !zones.includes(timezone) ? [timezone, ...zones] : zones,
  );
  const regionOptions = $derived([
    ...regionIds(),
    ...$workspace.customRegions.map((r) => r.id).filter((id) => !regionIds().includes(id)),
  ]);
  const regionName = (id: string): string => resolveRegion($workspace, id)?.name[$locale] ?? id;

  /** Opens the wizard at its first step. */
  export function show() {
    step = 1;
    choice = 'scrum';
    filledFor = null;
    name = '';
    start = localToday();
    names = {};
    me = false;
    myName = '';
    myRole = '';
    const settings = get(workspace).settings;
    withFrame = get(workspace).teams.length === 0;
    timezone = browserZone() ?? settings.timezone;
    region = settings.region;
    from = settings.horizon.from;
    to = settings.horizon.to;
    nameError = false;
    problem = null;
    dialog?.showModal();
  }

  function close() {
    dialog?.close();
  }

  async function go(next: number) {
    if (step === 1 && next === 2 && filledFor !== choice) {
      // Names and roles of another template do not fit this one.
      filledFor = choice;
      name = template ? template.name : get(t)('setup.defaultName');
      names = {};
      myRole = '';
    }
    if (step === 2 && next === 3 && name.trim() === '') {
      nameError = true;
      nameInput?.focus();
      return;
    }
    if (next === 3 && myRole === '') myRole = roles[0]?.id ?? '';
    step = next;
    await tick();
    heading?.focus();
  }

  function members(): SetupMember[] {
    const list: SetupMember[] = [];
    if (me && myRole !== '') list.push({ name: myName, roleId: myRole });
    for (const role of roles)
      for (const n of (names[role.id] ?? '').split(',')) list.push({ name: n, roleId: role.id });
    return list;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (step < steps) {
      void go(step + 1);
      return;
    }
    const trimmed = name.trim();
    const input = {
      template,
      name: trimmed,
      start: start || localToday(),
      members: members(),
      ...(withFrame ? { settings: { timezone, region, horizon: { from, to } } } : {}),
    };
    const result = workspace.apply((ws) => setupTeam(ws, input));
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      return;
    }
    if (result.id) activeTeamId.set(result.id);
    close();
    oncreated?.(trimmed);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-progress"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <h2 id="{uid}-title">{$t('setup.title')}</h2>
  <p class="progress" id="{uid}-progress">{$t('setup.progress', { n: step, total: steps })}</p>
  <form onsubmit={submit}>
    {#if step === 1}
      <fieldset>
        <legend><h3 tabindex="-1" bind:this={heading}>{$t('setup.way')}</h3></legend>
        {#each ids as id (id)}
          {@const tpl = builtinTemplate(id, $locale)}
          <div class="choice">
            <input
              type="radio"
              id="{uid}-way-{id}"
              name="{uid}-way"
              value={id}
              aria-describedby="{uid}-way-{id}-desc"
              bind:group={choice}
            />
            <span>
              <label for="{uid}-way-{id}">{tpl.name}</label>
              <span class="desc" id="{uid}-way-{id}-desc"
                >{$t('setup.tpl.desc', {
                  kind: $t('team.cadence.kind.' + tpl.team.cadence.kind),
                  weeks: tpl.team.cadence.lengthWeeks,
                  events: tpl.team.events.length,
                })}</span
              >
            </span>
          </div>
        {/each}
        <div class="choice">
          <input
            type="radio"
            id="{uid}-way-none"
            name="{uid}-way"
            value="none"
            aria-describedby="{uid}-way-none-desc"
            bind:group={choice}
          />
          <span>
            <label for="{uid}-way-none">{$t('setup.none')}</label>
            <span class="desc" id="{uid}-way-none-desc">{$t('setup.none.desc')}</span>
          </span>
        </div>
      </fieldset>
    {:else if step === 2}
      <h3 tabindex="-1" bind:this={heading}>{$t('setup.team')}</h3>
      <div class="field">
        <label for="{uid}-name">{$t('templates.teamName')}</label>
        <input
          id="{uid}-name"
          type="text"
          bind:this={nameInput}
          bind:value={name}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? `${uid}-name-err` : undefined}
          oninput={() => (nameError = false)}
        />
        {#if nameError}
          <p class="field-error" id="{uid}-name-err">{$t('templates.error.name')}</p>
        {/if}
      </div>
      <div class="field">
        <label for="{uid}-start">{$t('setup.start')}</label>
        <input id="{uid}-start" type="date" bind:value={start} />
      </div>
    {:else if step === 3}
      <h3 tabindex="-1" bind:this={heading}>{$t('setup.people')}</h3>
      {#if roles.length === 0}
        <p class="hint">{$t('setup.people.none')}</p>
      {:else}
        <p class="hint" id="{uid}-people-hint">
          {$t('setup.people.hint')}
          {#if known.length > 0}{$t('setup.people.known')}{/if}
        </p>
        {#if known.length > 0}
          <datalist id="{uid}-known">
            {#each known as person (person)}
              <option value={person}></option>
            {/each}
          </datalist>
        {/if}
        {#each roles as role (role.id)}
          <div class="field">
            <label for="{uid}-role-{role.id}">{role.name}</label>
            <input
              id="{uid}-role-{role.id}"
              type="text"
              list={known.length > 0 ? `${uid}-known` : undefined}
              aria-describedby="{uid}-people-hint"
              bind:value={names[role.id]}
            />
          </div>
        {/each}
        <div class="me">
          <label class="check">
            <input type="checkbox" bind:checked={me} />
            {$t('setup.me')}
          </label>
          {#if me}
            <div class="row">
              <div class="field">
                <label for="{uid}-me-name">{$t('setup.me.name')}</label>
                <input
                  id="{uid}-me-name"
                  type="text"
                  list={known.length > 0 ? `${uid}-known` : undefined}
                  bind:value={myName}
                />
              </div>
              <div class="field">
                <label for="{uid}-me-role">{$t('setup.me.role')}</label>
                <select id="{uid}-me-role" bind:value={myRole}>
                  {#each roles as role (role.id)}
                    <option value={role.id}>{role.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <h3 tabindex="-1" bind:this={heading}>{$t('setup.frame')}</h3>
      <p class="hint">{$t('setup.frame.hint')}</p>
      <div class="field">
        <label for="{uid}-tz">{$t('settings.timezone')}</label>
        {#if zoneOptions}
          <select id="{uid}-tz" bind:value={timezone}>
            {#each zoneOptions as zone (zone)}
              <option value={zone}>{zone}</option>
            {/each}
          </select>
        {:else}
          <input id="{uid}-tz" type="text" list="{uid}-tz-list" bind:value={timezone} />
          <datalist id="{uid}-tz-list">
            {#each FALLBACK_ZONES as zone (zone)}
              <option value={zone}></option>
            {/each}
          </datalist>
        {/if}
      </div>
      <div class="field">
        <label for="{uid}-region">{$t('settings.region')}</label>
        <select id="{uid}-region" bind:value={region}>
          {#each regionOptions as id (id)}
            <option value={id}>{regionName(id)}</option>
          {/each}
        </select>
      </div>
      <div class="row">
        <div class="field">
          <label for="{uid}-from">{$t('settings.horizon.from')}</label>
          <input id="{uid}-from" type="date" bind:value={from} />
        </div>
        <div class="field">
          <label for="{uid}-to">{$t('settings.horizon.to')}</label>
          <input id="{uid}-to" type="date" bind:value={to} />
        </div>
      </div>
    {/if}
    {#if problem}
      <p class="field-error" role="alert">{$t(problem.key, { path: problem.path ?? '' })}</p>
    {/if}
    <div class="steps-actions">
      {#if step > 1}
        <button type="button" onclick={() => go(step - 1)}>{$t('setup.back')}</button>
      {/if}
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
      <button type="submit" class="primary"
        >{step < steps ? $t('setup.next') : $t('templates.create')}</button
      >
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(36rem, calc(100vw - 2 * var(--space)));
    box-sizing: border-box;
    padding: calc(var(--space) * 1.5);
    background: var(--bg);
    color: var(--text);
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .progress {
    margin: 0.25rem 0 var(--space);
    color: var(--text-muted);
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  legend {
    padding: 0;
  }
  .choice {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .choice:has(input:checked) {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .choice input {
    margin-top: 0.3rem;
  }
  .choice label {
    font-weight: 600;
    cursor: pointer;
  }
  .desc {
    display: block;
    color: var(--text-muted);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
  }
  .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .hint {
    color: var(--text-muted);
    margin-top: 0;
  }
  .field-error {
    margin: 0.25rem 0 0;
    color: var(--danger);
  }
  input[type='text'],
  input[type='date'],
  select {
    max-width: 100%;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
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
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  .steps-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: var(--space);
  }
</style>
