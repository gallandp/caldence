<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { addCustomRegion, removeCustomRegion, updateSettings } from '../../core/edit';
  import { LIMITS } from '../../core/limits';
  import type { Settings } from '../../core/model';
  import { isBuiltinRegion, resolveRegion, validateRegion } from '../../core/regions';
  import type { ValidationError } from '../../core/validate';
  import { schoolHolidayGap } from '../../core/views';
  import { isKnownZone } from '../../core/zone';
  import { regionIds } from '../../data/regions';
  import { formatDisplayDate, translate as t, locale, type Locale } from '../../i18n';
  import ColourField, { PALETTE } from '../components/ColourField.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import { browserFileEnv, openTextFile } from '../state/files';
  import { fieldErrors } from '../state/form';
  import { pickFile } from '../state/picker';
  import { FALLBACK_ZONES, supportedZones } from '../state/zones';
  import { index, workspace } from '../state/workspace';

  const settings = $derived($workspace.settings);

  let errors = $state<Record<string, string>>({});

  // Errors and drafts belong to this view's own refused commits; undo, open or new make them stale.
  let own = false;
  onMount(() =>
    workspace.subscribe((ws) => {
      if (own) return;
      errors = {};
      regionProblem = null;
      importedRegion = null;
      from = ws.settings.horizon.from;
      to = ws.settings.horizon.to;
    }),
  );

  /** Commits a settings patch; `keys` are the field paths (under `settings`) the patch touches. */
  function commit(keys: string[], patch: Partial<Settings>): boolean {
    own = true;
    const result = workspace.apply((ws) => updateSettings(ws, patch));
    own = false;
    const next = { ...errors };
    for (const k of keys) delete next[k];
    errors = result.ok ? next : { ...next, ...fieldErrors(result.errors, 'settings') };
    return result.ok;
  }

  function fail(key: string, message = 'error.number.invalid') {
    errors = { ...errors, [key]: message };
  }

  function onNumber(key: 'hoursPerWeek', event: Event) {
    const n = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(n) || (event.currentTarget as HTMLInputElement).value.trim() === '')
      return fail(key);
    commit([key], { [key]: n });
  }

  function onThreshold(key: 'warnFactor' | 'maxFte', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const path = `thresholds.${key}`;
    if (!Number.isFinite(n) || input.value.trim() === '') return fail(path);
    commit([path], { thresholds: { ...settings.thresholds, [key]: n } });
  }

  /** An empty rate turns costs off. */
  function onRate(event: Event) {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    const n = Number(text);
    if (text !== '' && !Number.isFinite(n)) return fail('hourlyRate');
    commit(['hourlyRate'], { hourlyRate: text === '' ? undefined : n });
  }

  // ---------- horizon: from and to are checked together ----------

  // Drafts: reset only when the committed value changes, so an invalid draft stays on screen.
  let from = $derived(settings.horizon.from);
  let to = $derived(settings.horizon.to);

  function onHorizon() {
    const keys = ['horizon.from', 'horizon.to'];
    if (from === '') return fail('horizon.from', 'error.required');
    if (to === '') return fail('horizon.to', 'error.required');
    commit(keys, { horizon: { from, to } });
  }

  // ---------- workdays ----------

  const weekdayName = $derived((n: number) =>
    new Intl.DateTimeFormat($locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, n)), // 2024-01-01 is a Monday
    ),
  );

  function toggleDay(day: number, on: boolean): boolean {
    const rest = settings.workdays.filter((d) => d !== day);
    return commit(['workdays'], { workdays: (on ? [...rest, day] : rest).sort((a, b) => a - b) });
  }

  // ---------- selects ----------

  const regionName = (id: string): string => {
    const region = resolveRegion($workspace, id);
    if (!region) return id;
    const name = region.name[$locale];
    return isBuiltinRegion(id) ? name : name + $t('settings.region.custom');
  };
  /** The selected region names no built-in or imported region: it loads, but has no holidays. */
  const unknownRegion = $derived(resolveRegion($workspace, settings.region) === null);
  const regions = $derived([
    ...regionIds(),
    ...$workspace.customRegions.map((r) => r.id),
    ...(unknownRegion ? [settings.region] : []),
  ]);
  /** Imported regions that are not selected, so they can be removed. */
  const removable = $derived($workspace.customRegions.filter((r) => r.id !== settings.region));

  // ---------- region files: read only on this device, stored in the workspace ----------

  const env = browserFileEnv((accept) => pickFile(accept ?? '.json,application/json'));
  let importButton: HTMLButtonElement | undefined = $state();
  /** The refused region file or removal; `path` is a field inside the file, if any. */
  let regionProblem = $state<{ key: string; path?: string } | null>(null);
  /** The id of the region file just imported and selected, announced as a status message. */
  let importedRegion = $state<string | null>(null);
  const importedName = $derived.by(() => {
    const id = importedRegion;
    const region = id ? $workspace.customRegions.find((r) => r.id === id) : undefined;
    return region ? region.name[$locale] : null;
  });

  const problemOf = (list: ValidationError[]) => {
    const first = list[0];
    return { key: first?.key ?? 'error.type', path: first?.path || undefined };
  };

  async function importRegion() {
    importedRegion = null;
    let file;
    try {
      file = await openTextFile(env, [
        { description: $t('settings.region.file.type'), accept: { 'application/json': ['.json'] } },
      ]);
    } catch {
      regionProblem = { key: 'file.error.read' };
      return;
    }
    if (!file) return;
    if (file.text.length > LIMITS.fileChars) {
      regionProblem = { key: 'error.file.tooLarge' };
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      regionProblem = { key: 'error.file.json' };
      return;
    }
    const checked = validateRegion(parsed);
    if (!checked.ok) {
      regionProblem = problemOf(checked.errors);
      return;
    }
    const region = checked.value;
    own = true;
    // Adding and selecting the region is one change, so one undo step.
    const result = workspace.apply((ws) => {
      const added = addCustomRegion(ws, region);
      return added.ok ? updateSettings(added.value, { region: region.id }) : added;
    });
    own = false;
    regionProblem = result.ok ? null : problemOf(result.errors);
    if (result.ok) {
      importedRegion = region.id;
      const next = { ...errors };
      delete next.region;
      errors = next;
    }
  }

  async function removeRegion(id: string) {
    importedRegion = null;
    own = true;
    const result = workspace.apply((ws) => removeCustomRegion(ws, id));
    own = false;
    regionProblem = result.ok ? null : problemOf(result.errors);
    if (result.ok) {
      await tick();
      importButton?.focus();
    }
  }

  const errorText = (key: string, label: string) => $t(key, { path: label });

  const regionError = $derived(
    errors.region
      ? errorText(errors.region, $t('settings.region'))
      : regionProblem
        ? $t(regionProblem.key, { path: regionProblem.path ?? $t('settings.region') })
        : null,
  );

  /** The selected region's school holidays end before the planning horizon does. */
  const coverage = $derived.by(() => {
    const region = schoolHolidayGap($workspace, $index);
    if (!region) return null;
    return $t('region.beyondKnown', {
      region: region.name[$locale],
      date: formatDisplayDate($locale, region.schoolHolidaysKnownUntil, 'short'),
    });
  });

  const zones = supportedZones();
  const zoneOptions = $derived(
    zones && !zones.includes(settings.timezone) ? [settings.timezone, ...zones] : zones,
  );

  // A zone this browser does not know loads fine, but is flagged here because export and import need it.
  const tzError = $derived(
    errors.timezone
      ? errorText(errors.timezone, $t('settings.timezone'))
      : isKnownZone(settings.timezone)
        ? null
        : $t('settings.timezone.unknown', { zone: settings.timezone }),
  );

  function describe(key: string): string | undefined {
    return errors[key] ? `err-${key}` : undefined;
  }

  function confirmPerson(person: { id: string; name: string }) {
    const count = $workspace.teams.filter((team) =>
      team.members.some((m) => m.personId === person.id),
    ).length;
    if (count === 0) return null;
    return {
      title: $t('settings.people.confirm.title', { name: person.name }),
      message: $t('settings.people.confirm.message', { name: person.name, count }),
    };
  }

  const lang = (event: Event) =>
    commit([], { locale: (event.currentTarget as HTMLSelectElement).value as Locale });
</script>

{#snippet err(key: string, label: string)}
  {#if errors[key]}
    <p class="field-error" id="err-{key}">{errorText(errors[key], label)}</p>
  {/if}
{/snippet}

<div class="settings">
  <p class="help">{$t('settings.help.team')}</p>

  <section aria-labelledby="set-general">
    <h3 id="set-general">{$t('settings.general')}</h3>

    <div class="grid">
      <label class="field">
        <span>{$t('lang.label')}</span>
        <select value={settings.locale} onchange={lang}>
          {#each ['de', 'en'] as option (option)}
            <option value={option} lang={option}>{$t('lang.name.' + option)}</option>
          {/each}
        </select>
      </label>

      <div class="field">
        <label for="set-region">{$t('settings.region')}</label>
        <select
          id="set-region"
          value={settings.region}
          aria-invalid={regionError ? 'true' : undefined}
          aria-describedby={[regionError && 'err-region', unknownRegion && 'note-region']
            .filter(Boolean)
            .join(' ') || undefined}
          onchange={(e) => {
            regionProblem = null;
            importedRegion = null;
            commit(['region'], { region: e.currentTarget.value });
          }}
        >
          {#each regions as id (id)}
            <option value={id}>{regionName(id)}</option>
          {/each}
        </select>
        <!-- Always present, so screen readers announce what appears in them. -->
        <div role="alert">
          {#if regionError}
            <p class="field-error" id="err-region">{regionError}</p>
          {/if}
        </div>
        {#if unknownRegion}
          <p class="help" id="note-region">
            {$t('region.unknown', { region: settings.region })}
          </p>
        {/if}
        <div role="status">
          {#if importedName}
            <p class="help">{$t('settings.region.imported', { name: importedName })}</p>
          {/if}
        </div>
        <div class="region-actions">
          <button type="button" bind:this={importButton} onclick={importRegion}>
            {$t('settings.region.import')}
          </button>
          {#each removable as r (r.id)}
            <button type="button" onclick={() => removeRegion(r.id)}>
              {$t('settings.region.remove', { name: r.name[$locale] })}
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <label for="set-tz">{$t('settings.timezone')}</label>
        {#if zoneOptions}
          <select
            id="set-tz"
            value={settings.timezone}
            aria-invalid={tzError ? 'true' : undefined}
            aria-describedby={tzError ? 'err-timezone' : undefined}
            onchange={(e) => commit(['timezone'], { timezone: e.currentTarget.value })}
          >
            {#each zoneOptions as zone (zone)}
              <option value={zone}>{zone}</option>
            {/each}
          </select>
        {:else}
          <input
            id="set-tz"
            type="text"
            list="set-tz-list"
            value={settings.timezone}
            aria-invalid={tzError ? 'true' : undefined}
            aria-describedby={tzError ? 'err-timezone' : undefined}
            onchange={(e) => commit(['timezone'], { timezone: e.currentTarget.value.trim() })}
          />
          <datalist id="set-tz-list">
            {#each FALLBACK_ZONES as zone (zone)}
              <option value={zone}></option>
            {/each}
          </datalist>
        {/if}
        {#if tzError}
          <p class="field-error" id="err-timezone">{tzError}</p>
        {/if}
      </div>

      <div class="field">
        <label for="set-hours">{$t('settings.hoursPerWeek')}</label>
        <input
          id="set-hours"
          type="number"
          min="0"
          step="0.5"
          value={settings.hoursPerWeek}
          aria-invalid={errors.hoursPerWeek ? 'true' : undefined}
          aria-describedby={describe('hoursPerWeek')}
          onchange={(e) => onNumber('hoursPerWeek', e)}
        />
        {@render err('hoursPerWeek', $t('settings.hoursPerWeek'))}
      </div>
    </div>

    <fieldset aria-describedby={describe('workdays')}>
      <legend>{$t('settings.workdays')}</legend>
      <div class="days">
        {#each [1, 2, 3, 4, 5, 6, 7] as day (day)}
          <label class="check">
            <input
              type="checkbox"
              checked={settings.workdays.includes(day)}
              onchange={(e) => {
                // A refused commit leaves the stored state, so show that.
                if (!toggleDay(day, e.currentTarget.checked))
                  e.currentTarget.checked = settings.workdays.includes(day);
              }}
            />
            <span>{weekdayName(day)}</span>
          </label>
        {/each}
      </div>
      {@render err('workdays', $t('settings.workdays'))}
    </fieldset>

    <fieldset>
      <legend>{$t('settings.horizon')}</legend>
      <div class="grid">
        <div class="field">
          <label for="set-from">{$t('settings.horizon.from')}</label>
          <input
            id="set-from"
            type="date"
            bind:value={from}
            aria-invalid={errors['horizon.from'] ? 'true' : undefined}
            aria-describedby={describe('horizon.from')}
            onchange={onHorizon}
          />
          {@render err('horizon.from', $t('settings.horizon.from'))}
        </div>
        <div class="field">
          <label for="set-to">{$t('settings.horizon.to')}</label>
          <input
            id="set-to"
            type="date"
            bind:value={to}
            aria-invalid={errors['horizon.to'] ? 'true' : undefined}
            aria-describedby={describe('horizon.to')}
            onchange={onHorizon}
          />
          {@render err('horizon.to', $t('settings.horizon.to'))}
        </div>
      </div>
      {#if coverage}
        <p class="help">{coverage}</p>
      {/if}
    </fieldset>

    <label class="check holidays">
      <input
        type="checkbox"
        checked={settings.skipHolidays}
        onchange={(e) => commit(['skipHolidays'], { skipHolidays: e.currentTarget.checked })}
      />
      <span>{$t('settings.skipHolidays')}</span>
    </label>

    <fieldset>
      <legend>{$t('settings.thresholds')}</legend>
      <div class="grid">
        <div class="field">
          <label for="set-warn">{$t('settings.warnFactor')}</label>
          <input
            id="set-warn"
            type="number"
            min="0"
            step="0.1"
            value={settings.thresholds.warnFactor}
            aria-invalid={errors['thresholds.warnFactor'] ? 'true' : undefined}
            aria-describedby={describe('thresholds.warnFactor')}
            onchange={(e) => onThreshold('warnFactor', e)}
          />
          {@render err('thresholds.warnFactor', $t('settings.warnFactor'))}
        </div>
        <div class="field">
          <label for="set-fte">{$t('settings.maxFte')}</label>
          <input
            id="set-fte"
            type="number"
            min="0"
            step="0.05"
            value={settings.thresholds.maxFte}
            aria-invalid={errors['thresholds.maxFte'] ? 'true' : undefined}
            aria-describedby={describe('thresholds.maxFte')}
            onchange={(e) => onThreshold('maxFte', e)}
          />
          {@render err('thresholds.maxFte', $t('settings.maxFte'))}
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>{$t('settings.costs')}</legend>
      <div class="field">
        <label for="set-rate">{$t('settings.hourlyRate')}</label>
        <span class="rate-row">
          <input
            id="set-rate"
            type="number"
            min="0"
            step="1"
            value={settings.hourlyRate ?? ''}
            aria-invalid={errors.hourlyRate ? 'true' : undefined}
            aria-describedby={['note-rate', describe('hourlyRate')].filter(Boolean).join(' ')}
            onchange={onRate}
          />
          <span>{$t('settings.hourlyRate.unit')}</span>
        </span>
        {@render err('hourlyRate', $t('settings.hourlyRate'))}
        <p class="help rate-help" id="note-rate">{$t('settings.hourlyRate.help')}</p>
      </div>
    </fieldset>
  </section>

  <ListEditor
    kind="roles"
    items={$workspace.roles}
    heading={$t('settings.roles')}
    addLabel={$t('settings.roles.add')}
    create={(name) => ({ name, colour: PALETTE[$workspace.roles.length % PALETTE.length]!.hex })}
  >
    {#snippet extra(role, ctx)}
      <ColourField
        value={role.colour}
        label={$t('colour.of', { name: role.name })}
        onchange={(colour) => ctx.update({ colour })}
      />
    {/snippet}
  </ListEditor>

  <ListEditor
    kind="people"
    items={$workspace.people}
    heading={$t('settings.people')}
    addLabel={$t('settings.people.add')}
    create={(name) => ({ name, hoursPerWeek: settings.hoursPerWeek })}
    confirmRemove={confirmPerson}
  >
    {#snippet extra(person, ctx)}
      <label class="hours">
        <span class="hours-label">{$t('settings.people.hoursLabel')}</span>
        <span class="hours-row">
          <input
            type="number"
            min="0"
            step="0.5"
            value={person.hoursPerWeek}
            aria-label={$t('settings.people.hours', { name: person.name })}
            aria-invalid={ctx.errors.hoursPerWeek ? 'true' : undefined}
            aria-describedby={ctx.errors.hoursPerWeek ? `err-hours-${person.id}` : undefined}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              if (e.currentTarget.value.trim() === '' || !Number.isFinite(n))
                return ctx.fail('hoursPerWeek', 'error.number.invalid');
              ctx.update({ hoursPerWeek: n });
            }}
          />
          <span>{$t('settings.people.unit')}</span>
        </span>
      </label>
      {#if ctx.errors.hoursPerWeek}
        <p class="field-error" id="err-hours-{person.id}">
          {$t(ctx.errors.hoursPerWeek, { path: person.name })}
        </p>
      {/if}
    {/snippet}
  </ListEditor>
</div>

<style>
  .settings {
    max-width: 48rem;
  }
  .help {
    color: var(--text-muted);
  }
  h3 {
    margin-bottom: 0.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space);
    margin-bottom: var(--space);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0 0 var(--space);
    padding: 0.5rem var(--space) var(--space);
    min-width: 0;
  }
  legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }
  .days {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem;
  }
  .check input {
    width: 1.25rem;
    height: 1.25rem;
  }
  .holidays {
    margin-bottom: var(--space);
  }
  .hours {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-muted);
  }
  .hours-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text);
  }
  .hours input {
    width: 5.5rem;
  }
  .rate-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .rate-row input {
    width: 8rem;
  }
  .rate-help {
    margin: 0;
  }
  .region-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  select,
  input[type='number'],
  input[type='text'],
  input[type='date'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
</style>
