<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { capacity, hoursLeft, placesOf } from '../../core/load';
  import { record } from '../../core/record';
  import { setupTeam, type SetupMember } from '../../core/setup';
  import { areaRoleIds, templateStart, type Template } from '../../core/template';
  import { BUILTIN_TEMPLATES, builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { formatDisplayDate, locale, translate as t } from '../../i18n';
  import { resolveRegion } from '../../core/regions';
  import { regionIds } from '../../data/regions';
  import { saveExportChoice } from '../state/exportScope';
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
  /** A date the person picked stays when they choose another way of working. */
  let startPicked = false;
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
  /** Hours typed for people already in another team, by name (trimmed, lower case). */
  let hoursHere = $state<Record<string, string>>({});
  /** The name whose hours are not a valid number, if any. */
  let badHours = $state<string | null>(null);

  const template = $derived<Template | null>(
    choice === 'none' ? null : builtinTemplate(choice, $locale),
  );
  const roles = $derived(template ? template.roles : $workspace.roles);
  /** Templates start on a fixed weekday (or with the area's next increment), not on any date. */
  const actual = $derived(template && start ? templateStart($workspace, template, start) : null);
  const moved = $derived(actual && actual.start !== start ? actual : null);
  const movedText = $derived.by(() => {
    if (!moved || !template) return '';
    const date = formatDisplayDate($locale, moved.start, 'long');
    if (moved.area) return $t('setup.start.joined', { area: moved.area, date });
    const weekday = new Intl.DateTimeFormat($locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${moved.start}T00:00:00Z`),
    );
    return $t('setup.start.moved', { template: template.name, weekday, date });
  });
  const steps = $derived(withFrame ? 4 : 3);
  /** People of the workspace; a name entered again is the same person. */
  const known = $derived.by(() => {
    const seen: string[] = [];
    const names: string[] = [];
    for (const p of $workspace.people) {
      const key = p.name.trim().toLowerCase();
      if (key === '' || seen.includes(key)) continue;
      seen.push(key);
      names.push(p.name.trim());
    }
    return names;
  });
  /** Typed names of people already in a team or area: they get asked for their hours here. */
  const already = $derived.by(() => {
    const ws = $workspace;
    const seen: string[] = [];
    const out: { key: string; name: string; places: string; hours: number; left: number }[] = [];
    // Someone entered only for an area role (SAFe RTE) does not join the team: no hours asked.
    const areaOnly = template ? areaRoleIds(template) : new Set<string>();
    for (const m of members().filter((x) => !areaOnly.has(x.roleId))) {
      const key = m.name.trim().toLowerCase();
      if (key === '' || seen.includes(key)) continue;
      seen.push(key);
      const person = ws.people.find((p) => p.name.trim().toLowerCase() === key);
      const places = person ? placesOf(ws, person.id) : [];
      if (!person || places.length === 0) continue;
      out.push({
        key,
        name: person.name,
        places: places.join(', '),
        hours: capacity(ws, person.id),
        left: hoursLeft(ws, person.id),
      });
    }
    return out;
  });
  const num = (n: number) => new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n);
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
    startPicked = false;
    names = {};
    hoursHere = {};
    badHours = null;
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
      if (!startPicked)
        start = template
          ? templateStart(get(workspace), template, localToday()).start
          : localToday();
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
    const hours = record<number>();
    for (const [i, a] of already.entries()) {
      const raw = hoursHere[a.key] ?? '';
      const n = raw.trim() === '' ? a.left : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        problem = {
          key: 'error.number.invalid',
          path: get(t)('team.members.hoursOf', { name: a.name, team: trimmed }),
        };
        badHours = a.key;
        document.getElementById(`${uid}-hours-${i}`)?.focus();
        return;
      }
      hours[a.key] = n;
    }
    const input = {
      template,
      name: trimmed,
      start: start || localToday(),
      members: members(),
      hours,
      ...(withFrame ? { settings: { timezone, region, horizon: { from, to } } } : {}),
    };
    const result = workspace.apply((ws) => setupTeam(ws, input));
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      return;
    }
    if (result.id) activeTeamId.set(result.id);
    // "I am part of it": this browser's exports start with this person (not stored in the file).
    const self = myName.trim().toLowerCase();
    const mine =
      me && self !== '' && result.value.people.find((p) => p.name.trim().toLowerCase() === self);
    if (mine) saveExportChoice(result.value.id, { kind: 'person', id: mine.id });
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
  <h2 id="{uid}-title">{$t(withFrame ? 'setup.title' : 'setup.another')}</h2>
  <p class="progress" id="{uid}-progress">{$t('setup.progress', { n: step, total: steps })}</p>
  <form onsubmit={submit}>
    {#if step === 1}
      <fieldset>
        <legend><h3 tabindex="-1" bind:this={heading}>{$t('setup.way')}</h3></legend>
        {#each ids as id (id)}
          {@const tpl = builtinTemplate(id, $locale)}
          <label class="choice">
            <input
              type="radio"
              id="{uid}-way-{id}"
              name="{uid}-way"
              value={id}
              aria-labelledby="{uid}-way-{id}-name"
              aria-describedby="{uid}-way-{id}-desc"
              bind:group={choice}
            />
            <span>
              <span class="name" id="{uid}-way-{id}-name">{tpl.name}</span>
              <span class="desc" id="{uid}-way-{id}-desc"
                >{$t(
                  (tpl.area ?? tpl.team).cadence.lengthWeeks === 1
                    ? 'setup.tpl.desc.one'
                    : 'setup.tpl.desc.other',
                  {
                    kind: $t('team.cadence.kind.' + (tpl.area ?? tpl.team).cadence.kind),
                    weeks: (tpl.area ?? tpl.team).cadence.lengthWeeks,
                    events: tpl.team.events.length + (tpl.area?.events.length ?? 0),
                  },
                )}</span
              >
            </span>
          </label>
        {/each}
        <label class="choice">
          <input
            type="radio"
            id="{uid}-way-none"
            name="{uid}-way"
            value="none"
            aria-labelledby="{uid}-way-none-name"
            aria-describedby="{uid}-way-none-desc"
            bind:group={choice}
          />
          <span>
            <span class="name" id="{uid}-way-none-name">{$t('setup.none')}</span>
            <span class="desc" id="{uid}-way-none-desc">{$t('setup.none.desc')}</span>
          </span>
        </label>
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
        <input
          id="{uid}-start"
          type="date"
          bind:value={start}
          oninput={() => (startPicked = true)}
          aria-describedby={moved ? `${uid}-start-moved` : undefined}
        />
        <!-- Always present, so screen readers announce the text when it appears. -->
        <p class="hint moved" id="{uid}-start-moved" aria-live="polite">
          {movedText}
        </p>
      </div>
    {:else if step === 3}
      <h3 tabindex="-1" bind:this={heading}>{$t('setup.people')}</h3>
      {#if roles.length === 0}
        <p class="hint">{$t('setup.people.none')}</p>
      {:else}
        <p class="hint" id="{uid}-people-hint">
          {$t('setup.people.hint')}
          {#if known.length > 0}{$t('setup.people.known', { names: known.join(', ') })}{/if}
        </p>
        {#each roles as role (role.id)}
          <div class="field">
            <label for="{uid}-role-{role.id}">{role.name}</label>
            <input
              id="{uid}-role-{role.id}"
              type="text"
              aria-describedby="{uid}-people-hint"
              bind:value={names[role.id]}
            />
          </div>
        {/each}
        {#each already as a, i (a.key)}
          <div class="already">
            <label for="{uid}-hours-{i}"
              >{$t('team.people.already', {
                name: a.name,
                units: a.places,
                hours: num(a.hours),
              })}</label
            >
            <span class="hours"
              ><input
                id="{uid}-hours-{i}"
                type="number"
                min="0"
                step="0.5"
                value={hoursHere[a.key] ?? String(a.left)}
                aria-invalid={badHours === a.key ? 'true' : undefined}
                aria-describedby={a.left === 0 ? `${uid}-none-${i}` : undefined}
                oninput={(e) => {
                  hoursHere[a.key] = e.currentTarget.value;
                  if (badHours === a.key) badHours = null;
                }}
              />{$t('settings.people.unit')}</span
            >
            {#if a.left === 0}
              <p class="none-left" id="{uid}-none-{i}">{$t('team.people.noneLeft')}</p>
            {/if}
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
                <input id="{uid}-me-name" type="text" bind:value={myName} />
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
  .name {
    font-weight: 600;
  }
  .desc {
    display: block;
    /* The card is a label now; keep the description at body size, not the label size. */
    font-size: 1rem;
    font-weight: 400;
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
  .already {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
    margin-bottom: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent);
    background: var(--surface-2);
  }
  .already label {
    flex: 1 1 14rem;
  }
  .already .hours {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
  }
  .already input {
    width: 5rem;
  }
  .none-left {
    flex-basis: 100%;
    margin: 0;
    color: var(--warn);
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
  .hint.moved:empty {
    margin: 0;
  }
  .field-error {
    margin: 0.25rem 0 0;
    color: var(--danger);
  }
  input[type='text'],
  input[type='number'],
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
