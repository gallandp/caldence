<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { capacity, hoursLeft, placesOf } from '../../core/load';
  import { record } from '../../core/record';
  import { LEVEL_PRESETS, type LevelPreset } from '../../core/levels';
  import { lineSelection } from '../../core/model';
  import {
    setupLine,
    setupStructure,
    setupTeam,
    splitNames,
    type SetupMember,
    type SetupMode,
  } from '../../core/setup';
  import { areaRoleIds, templateStart, type Template } from '../../core/template';
  import { BUILTIN_TEMPLATES, builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { formatDisplayDate, levels, locale, translate as t } from '../../i18n';
  import { levelWords } from '../../i18n/levels';
  import { resolveRegion } from '../../core/regions';
  import { regionIds } from '../../data/regions';
  import { saveExportChoice } from '../state/exportScope';
  import { activeTeamId, localToday, workspace } from '../state/workspace';
  import { browserZone, FALLBACK_ZONES, supportedZones } from '../state/zones';

  /** Called once the team (or area, organisation, line teams) was created and the dialog is closed. */
  let { oncreated }: { oncreated?: (name: string, mode: SetupMode) => void } = $props();

  const uid = $props.id();
  const ids = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateId[];

  let dialog: HTMLDialogElement | undefined;
  let heading = $state<HTMLElement>();
  let nameInput = $state<HTMLInputElement>();
  let step = $state(1);
  let mode = $state<SetupMode>('team');
  /** Opened as product owner: "I take part myself" offers the Product Owner role first. */
  let asOwner = false;
  /** The level names chosen for an area or organisation (#387). */
  let preset = $state<LevelPreset>('area');
  let areaName = $state('');
  let teamsText = $state('');
  let orgName = $state('');
  let rows = $state<{ name: string; teams: string }[]>([]);
  let lineGroup = $state('');
  let lineTeams = $state('');
  /** A field of the area, organisation or line step that needs an entry. */
  let structError = $state<{ field: string; key: string } | null>(null);
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
  /** The steps of each mode; the frame (time zone, region, horizon) only for an empty file. */
  const kinds = $derived([
    ...(mode === 'team'
      ? ['way', 'team', 'people']
      : mode === 'line'
        ? ['line']
        : ['way', 'structure']),
    ...(withFrame ? ['frame'] : []),
  ] as const);
  const steps = $derived(kinds.length);
  const current = $derived(kinds[step - 1]);
  /** Own level names stay; otherwise the area and organisation steps offer the presets. */
  const ownNames = $derived(
    $workspace.settings.levelNames !== undefined && !('preset' in $workspace.settings.levelNames),
  );
  const words = $derived(ownNames ? $levels : levelWords({ preset }, $locale));
  const titleKey = $derived(
    mode === 'team' ? (withFrame ? 'setup.title' : 'setup.another') : `setup.${mode}.title`,
  );
  /** The org rows someone typed into; empty extra rows are ignored. */
  const filledRows = $derived(rows.filter((r) => r.name.trim() !== '' || r.teams.trim() !== ''));
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

  /**
   * Opens the wizard at its first step, for one team or, from the start screen's roles (#387), for
   * an area, the product organisation or line teams. `owner`: opened as product owner.
   */
  export async function show(as: SetupMode = 'team', owner = false) {
    step = 1;
    mode = as;
    asOwner = owner;
    const levelNames = get(workspace).settings.levelNames;
    preset = levelNames && 'preset' in levelNames ? levelNames.preset : 'area';
    areaName = '';
    teamsText = '';
    orgName = '';
    rows = [{ name: '', teams: '' }];
    lineGroup = '';
    lineTeams = '';
    structError = null;
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
    // Line teams set the frame already (#387).
    withFrame = get(workspace).teams.length === 0 && !get(workspace).lineUnits?.length;
    timezone = browserZone() ?? settings.timezone;
    region = settings.region;
    from = settings.horizon.from;
    to = settings.horizon.to;
    nameError = false;
    problem = null;
    // The first step differs per mode: render it before the dialog picks its first focus.
    await tick();
    dialog?.showModal();
  }

  function close() {
    dialog?.close();
  }

  /** The Product Owner role of the chosen way of working, if it has one. */
  const ownerRole = (): string | undefined =>
    roles.find((r) => r.name.trim().toLowerCase() === 'product owner')?.id;

  function bad(field: string, key: string): false {
    structError = { field, key };
    void tick().then(() => document.getElementById(`${uid}-${field}`)?.focus());
    return false;
  }

  /** The area, organisation and line steps need names before going on. */
  function checkStructure(): boolean {
    structError = null;
    if (mode === 'area') {
      if (areaName.trim() === '') return bad('area-name', 'setup.error.name');
      if (splitNames(teamsText).length === 0) return bad('area-teams', 'setup.error.names');
    } else if (mode === 'org') {
      if (filledRows.length === 0) return bad('row-0-name', 'setup.error.name');
      for (const [i, row] of rows.entries())
        if (row.teams.trim() !== '' && row.name.trim() === '')
          return bad(`row-${i}-name`, 'setup.error.name');
      if (!filledRows.some((r) => splitNames(r.teams).length > 0))
        return bad(`row-${rows.indexOf(filledRows[0]!)}-teams`, 'setup.error.names');
    } else if (mode === 'line') {
      const teams = splitNames(lineTeams);
      if (teams.length === 0) return bad('line-teams', 'setup.error.names');
      // Line unit names are unique in a file, the group's too.
      const existing = ($workspace.lineUnits ?? []).map((u) => u.name.trim().toLowerCase());
      const group = lineGroup.trim().toLowerCase();
      if (group !== '' && existing.includes(group)) return bad('line-group', 'setup.error.taken');
      const taken = group === '' ? existing : [...existing, group];
      if (teams.some((n) => taken.includes(n.toLowerCase())))
        return bad('line-teams', 'setup.error.taken');
    }
    return true;
  }

  async function addRow() {
    rows.push({ name: '', teams: '' });
    await tick();
    document.getElementById(`${uid}-row-${rows.length - 1}-name`)?.focus();
  }

  async function removeRow(i: number) {
    rows.splice(i, 1);
    if (structError) structError = null;
    await tick();
    document.getElementById(`${uid}-row-${Math.min(i, rows.length - 1)}-name`)?.focus();
  }

  async function go(next: number) {
    const leaving = current;
    if (leaving === 'way' && next > step && filledFor !== choice) {
      // Names and roles of another template do not fit this one.
      filledFor = choice;
      name = template ? template.name : get(t)('setup.defaultName');
      if (!startPicked)
        start = template
          ? templateStart(get(workspace), template, localToday()).start
          : localToday();
      names = {};
      myRole = '';
      // A product owner who takes part does so as Product Owner.
      const owner = asOwner ? ownerRole() : undefined;
      if (owner) myRole = owner;
    }
    if (next > step && leaving === 'team' && name.trim() === '') {
      nameError = true;
      nameInput?.focus();
      return;
    }
    if (next > step && (leaving === 'structure' || leaving === 'line') && !checkStructure()) return;
    if (kinds[next - 1] === 'people' && myRole === '') myRole = roles[0]?.id ?? '';
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
    if (mode !== 'team') {
      createStructure();
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
    oncreated?.(trimmed, 'team');
  }

  /** Creates the area, the organisation or the line teams (#387). */
  function createStructure() {
    const frame = withFrame ? { settings: { timezone, region, horizon: { from, to } } } : {};
    const result =
      mode === 'line'
        ? workspace.apply((ws) =>
            setupLine(ws, {
              organisation: orgName,
              group: lineGroup,
              teams: splitNames(lineTeams),
              ...frame,
            }),
          )
        : workspace.apply((ws) =>
            setupStructure(ws, {
              template,
              start: start || localToday(),
              ...(mode === 'org' ? { organisation: orgName } : {}),
              ...(ownNames ? {} : { levelNames: { preset } }),
              areas:
                mode === 'area'
                  ? [{ name: areaName, teams: splitNames(teamsText) }]
                  : filledRows.map((r) => ({ name: r.name, teams: splitNames(r.teams) })),
              ...frame,
            }),
          );
    if (!result.ok) {
      const first = result.errors[0];
      problem = { key: first?.key ?? 'error.type', path: first?.path };
      return;
    }
    if (result.id) activeTeamId.set(mode === 'line' ? lineSelection(result.id) : result.id);
    close();
    oncreated?.(mode === 'area' ? areaName.trim() : orgName.trim(), mode);
  }
</script>

{#snippet startField()}
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
{/snippet}

{#snippet textField(
  field: string,
  label: string,
  read: () => string,
  write: (v: string) => void,
  hint?: string,
)}
  {@const wrong = structError?.field === field}
  <div class="field">
    <label for="{uid}-{field}">{label}</label>
    <input
      id="{uid}-{field}"
      type="text"
      value={read()}
      aria-invalid={wrong ? 'true' : undefined}
      aria-describedby={[hint ? `${uid}-${field}-hint` : '', wrong ? `${uid}-${field}-err` : '']
        .filter(Boolean)
        .join(' ') || undefined}
      oninput={(e) => {
        write(e.currentTarget.value);
        if (wrong) structError = null;
      }}
    />
    {#if hint}<p class="hint" id="{uid}-{field}-hint">{hint}</p>{/if}
    {#if wrong}<p class="field-error" id="{uid}-{field}-err">{$t(structError!.key)}</p>{/if}
  </div>
{/snippet}

{#snippet teamsField(field: string, read: () => string, write: (v: string) => void)}
  {@const wrong = structError?.field === field}
  <div class="field">
    <label for="{uid}-{field}">{$t('setup.area.teams', { teams: words.teams })}</label>
    <textarea
      id="{uid}-{field}"
      rows="3"
      value={read()}
      aria-invalid={wrong ? 'true' : undefined}
      aria-describedby="{uid}-{field}-hint{wrong ? ` ${uid}-${field}-err` : ''}"
      oninput={(e) => {
        write(e.currentTarget.value);
        if (wrong) structError = null;
      }}></textarea>
    <p class="hint" id="{uid}-{field}-hint">{$t('setup.names.hint')}</p>
    {#if wrong}<p class="field-error" id="{uid}-{field}-err">{$t(structError!.key)}</p>{/if}
  </div>
{/snippet}

<dialog
  bind:this={dialog}
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-progress"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <h2 id="{uid}-title">{$t(titleKey)}</h2>
  <p class="progress" id="{uid}-progress">{$t('setup.progress', { n: step, total: steps })}</p>
  <form onsubmit={submit}>
    {#if current === 'way'}
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
    {:else if current === 'team'}
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
      {@render startField()}
    {:else if current === 'people'}
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
    {:else if current === 'structure'}
      <h3 tabindex="-1" bind:this={heading}>
        {$t(mode === 'org' ? 'setup.org.heading' : 'setup.area.heading', { area: words.area })}
      </h3>
      {#if !ownNames}
        <div class="field">
          <label for="{uid}-levels">{$t('setup.levels')}</label>
          <select id="{uid}-levels" bind:value={preset} aria-describedby="{uid}-levels-hint">
            {#each LEVEL_PRESETS as p (p)}
              {@const w = levelWords({ preset: p }, $locale)}
              <option value={p}>{$t('level.preset', { area: w.area, team: w.team })}</option>
            {/each}
          </select>
          <p class="hint" id="{uid}-levels-hint">{$t('setup.levels.hint')}</p>
        </div>
      {/if}
      {#if mode === 'org'}
        {@render textField(
          'org-name',
          $t('setup.org.name'),
          () => orgName,
          (v) => (orgName = v),
        )}
        {#each rows as row, i (i)}
          <fieldset class="unit">
            <legend>{$t('setup.org.unit', { area: words.area, n: i + 1 })}</legend>
            {@render textField(
              `row-${i}-name`,
              $t('setup.area.name', { area: words.area }),
              () => row.name,
              (v) => (row.name = v),
            )}
            {@render teamsField(
              `row-${i}-teams`,
              () => row.teams,
              (v) => (row.teams = v),
            )}
            {#if rows.length > 1}
              <button type="button" class="link" onclick={() => removeRow(i)}
                >{$t('setup.org.remove', { area: words.area, n: i + 1 })}</button
              >
            {/if}
          </fieldset>
        {/each}
        <button type="button" class="add" onclick={addRow}
          >{$t('setup.org.add', { area: words.area, areaLc: words.areaLc })}</button
        >
      {:else}
        {@render textField(
          'area-name',
          $t('setup.area.name', { area: words.area }),
          () => areaName,
          (v) => (areaName = v),
        )}
        {@render teamsField(
          'area-teams',
          () => teamsText,
          (v) => (teamsText = v),
        )}
      {/if}
      {@render startField()}
    {:else if current === 'line'}
      <h3 tabindex="-1" bind:this={heading}>{$t('setup.line.heading')}</h3>
      <p class="hint">{$t('setup.line.hint')}</p>
      {#if !$workspace.organisation?.name}
        {@render textField(
          'line-org',
          $t('setup.org.name'),
          () => orgName,
          (v) => (orgName = v),
          $t('setup.line.org.hint'),
        )}
      {/if}
      {@render textField(
        'line-group',
        $t('setup.line.group', { group: $levels.lineGroup }),
        () => lineGroup,
        (v) => (lineGroup = v),
        $t('setup.line.group.hint'),
      )}
      <div class="field">
        <label for="{uid}-line-teams">{$t('setup.line.teams')}</label>
        <textarea
          id="{uid}-line-teams"
          rows="4"
          bind:value={lineTeams}
          aria-invalid={structError?.field === 'line-teams' ? 'true' : undefined}
          aria-describedby="{uid}-line-teams-hint{structError?.field === 'line-teams'
            ? ` ${uid}-line-teams-err`
            : ''}"
          oninput={() => (structError = null)}></textarea>
        <p class="hint" id="{uid}-line-teams-hint">{$t('setup.names.hint')}</p>
        {#if structError?.field === 'line-teams'}
          <p class="field-error" id="{uid}-line-teams-err">{$t(structError.key)}</p>
        {/if}
      </div>
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
        <select id="{uid}-region" bind:value={region} aria-describedby="{uid}-region-check">
          {#each regionOptions as id (id)}
            <option value={id}>{regionName(id)}</option>
          {/each}
        </select>
        <!-- Preset, not chosen: say so (#341). -->
        <p class="hint" id="{uid}-region-check">{$t('settings.region.check')}</p>
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
        >{step < steps
          ? $t('setup.next')
          : $t(mode === 'team' ? 'templates.create' : 'setup.create')}</button
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
  textarea,
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
  textarea {
    resize: vertical;
  }
  .unit {
    margin: 0 0 0.75rem;
    padding: 0.75rem 0.9rem 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .unit legend {
    padding: 0 0.35rem;
    font-weight: 600;
  }
  /* A quiet text action; the shared #app button style would draw a frame. */
  :global(#app) .unit button.link {
    margin: 0 0 0.6rem;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .add {
    margin-bottom: 0.75rem;
  }
  .steps-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: var(--space);
  }
</style>
