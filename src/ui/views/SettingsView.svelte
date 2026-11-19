<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { addCustomRegion, removeCustomRegion, updateSettings } from '../../core/edit';
  import { LEVEL_PRESETS, type LevelPreset } from '../../core/levels';
  import { levelWords, lineLevelWord } from '../../i18n/levels';
  import { lineLevels } from '../../core/lineLevels';
  import { newLineLevelId, setLineLevels } from '../../core/lineEdit';
  import { lineKind } from '../../core/lineStaff';
  import { DEFAULT_CONTEXT_SWITCH, MIN_CONTEXT_SWITCH } from '../../core/contextSwitch';
  import { LIMITS } from '../../core/limits';
  import type { LineLevel, Settings } from '../../core/model';
  import { isBuiltinRegion, resolveRegion, validateRegion } from '../../core/regions';
  import type { ValidationError } from '../../core/validate';
  import { schoolHolidayGap } from '../../core/views';
  import { isKnownZone } from '../../core/zone';
  import { regionIds } from '../../data/regions';
  import {
    formatDisplayDate,
    levels as levelStore,
    translate as t,
    locale,
    type Locale,
  } from '../../i18n';
  import { browserFileEnv, openTextFile } from '../state/files';
  import { fieldErrors } from '../state/form';
  import { pickFile } from '../state/picker';
  import { FALLBACK_ZONES, supportedZones } from '../state/zones';
  import { index, workspace } from '../state/workspace';
  import ThemeSwitch from '../ThemeSwitch.svelte';
  import { setLanguage } from '../state/language';

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

  /** The limit is stored as a share (0.6) but entered in percent (60). */
  function onThreshold(key: 'warnFactor' | 'maxFte', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const path = `thresholds.${key}`;
    if (!Number.isFinite(n) || input.value.trim() === '') return fail(path);
    const value = key === 'maxFte' ? n / 100 : n;
    commit([path], { thresholds: { ...settings.thresholds, [key]: value } });
  }

  /** A whole number of teams from 2 on; the hint itself never blocks anything (#321). */
  function onContextSwitch(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const path = 'thresholds.contextSwitch';
    if (
      input.value.trim() === '' ||
      !Number.isInteger(n) ||
      n < MIN_CONTEXT_SWITCH ||
      n > LIMITS.teams
    )
      return fail(path);
    commit([path], { thresholds: { ...settings.thresholds, contextSwitch: n } });
  }

  /** An empty rate turns costs off. */
  function onRate(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const text = input.value.trim();
    const n = Number(text);
    // Unparseable text also reads as '': that is a typo, not a cleared field.
    if (input.validity.badInput || (text !== '' && !Number.isFinite(n))) return fail('hourlyRate');
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
    if (region.schoolHolidays.length === 0)
      return $t('region.noSchool', { region: region.name[$locale] });
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

  // Level names: a preset or own names. The default preset is stored as no setting at all.
  const levelChoice = $derived(
    settings.levelNames === undefined
      ? 'area'
      : 'preset' in settings.levelNames
        ? settings.levelNames.preset
        : 'custom',
  );
  const presetLabel = (preset: LevelPreset) => {
    const w = levelWords({ preset }, $locale);
    return $t('level.preset', { area: w.area, team: w.team });
  };
  function onLevelChoice(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'custom') {
      const w = levelWords(settings.levelNames, $locale);
      commit(['levelNames.area', 'levelNames.team'], {
        levelNames: { area: w.area, team: w.team },
      });
    } else
      commit(['levelNames.area', 'levelNames.team'], {
        levelNames: value === 'area' ? undefined : { preset: value as LevelPreset },
      });
  }
  function onLevelName(level: 'organisation' | 'area' | 'team', event: Event) {
    const names = settings.levelNames;
    if (!names || 'preset' in names) return;
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    const next = { ...names, [level]: text };
    // The top level's name is optional: emptied, the organisation keeps its word (#313).
    if (level === 'organisation' && text === '') delete next.organisation;
    commit([`levelNames.${level}`], { levelNames: next });
  }

  /** The line's levels (#316, #408), offered once the file has a line. */
  const hasLine = $derived(
    ($workspace.lineUnits?.length ?? 0) > 0 || settings.lineLevels !== undefined,
  );
  const lineList = $derived(lineLevels(settings));
  /** Units per level id, chosen or derived, so a level in use cannot be removed. */
  const lineUse = $derived.by(() => {
    const use: Record<string, number> = {};
    for (const u of $workspace.lineUnits ?? []) {
      const k = lineKind($workspace, u.id);
      use[k] = (use[k] ?? 0) + 1;
    }
    return use;
  });
  let lineError = $state('');
  let lineInputs: HTMLInputElement[] = $state([]);
  /** The name a level shows in its field: its own, else the one of the old setting. */
  const lineName = (l: LineLevel) =>
    l.name ?? settings.lineLevelNames?.[l.id as 'group' | 'team' | 'company'] ?? '';
  function setLines(next: LineLevel[]): boolean {
    const result = workspace.apply((ws) => setLineLevels(ws, next));
    const first = result.ok ? undefined : result.errors[0];
    // A rule about the units (order, depth) is named as a conflict with the line, not by its path.
    lineError = !first
      ? ''
      : first.path.startsWith('lineUnits')
        ? 'settings.lineLevels.conflict'
        : first.key;
    return result.ok;
  }
  const withNames = () => lineList.map((l) => ({ ...l, name: lineName(l) || undefined }));
  function onLineName(i: number, event: Event) {
    const next = withNames();
    const input = event.currentTarget as HTMLInputElement;
    next[i] = { ...next[i]!, name: input.value.trim() };
    // Refused (an own level without a name): the field shows the stored name again.
    if (!setLines(next)) input.value = lineName(lineList[i]!);
  }
  function moveLine(i: number, by: -1 | 1) {
    const next = withNames();
    const [l] = next.splice(i, 1);
    next.splice(i + by, 0, l!);
    const id = l!.id;
    const same = by < 0 ? 'up' : 'down';
    const other = by < 0 ? 'down' : 'up';
    // Focus stays on the arrow, so the level can be moved again; at the end on the other one.
    if (setLines(next))
      tick().then(() => {
        const at = (dir: string) =>
          document.querySelector<HTMLButtonElement>(`[data-move="${id}:${dir}"]:not(:disabled)`);
        (at(same) ?? at(other))?.focus();
      });
  }
  function removeLine(i: number) {
    const next = withNames();
    next.splice(i, 1);
    if (setLines(next)) tick().then(() => lineInputs[Math.min(i, next.length - 1)]?.focus());
  }
  function addLine() {
    const next = withNames();
    const name = $t('settings.lineLevels.new', { n: next.length + 1 });
    next.push({ id: newLineLevelId($workspace), name });
    if (setLines(next))
      tick().then(() => {
        lineInputs[next.length - 1]?.focus();
        lineInputs[next.length - 1]?.select();
      });
  }
  function onCompanyLevel(event: Event) {
    const next = withNames();
    const on = (event.currentTarget as HTMLInputElement).checked;
    next[0] = { ...next[0]!, company: on || undefined };
    setLines(next);
  }

  // A setting of this browser, like the theme: switching it does not change the file (#337).
  const lang = (event: Event) =>
    setLanguage((event.currentTarget as HTMLSelectElement).value as Locale);
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
      <div class="field">
        <label for="set-lang">{$t('lang.label')}</label>
        <select id="set-lang" value={$locale} onchange={lang} aria-describedby="note-lang">
          {#each ['de', 'en'] as option (option)}
            <option value={option} lang={option}>{$t('lang.name.' + option)}</option>
          {/each}
        </select>
        <p class="help" id="note-lang">{$t('lang.browser')}</p>
      </div>

      <div class="field">
        <label for="set-region">{$t('settings.region')}</label>
        <select
          id="set-region"
          value={settings.region}
          aria-invalid={regionError ? 'true' : undefined}
          aria-describedby={[
            regionError && 'err-region',
            unknownRegion && 'note-region',
            'note-region-check',
          ]
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
        <!-- The region is preset; holidays decide which meetings drop out (#341). -->
        <p class="help" id="note-region-check">{$t('settings.region.check')}</p>
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

      <div class="wide"><ThemeSwitch /></div>
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
      <p class="help">{$t('settings.horizon.hint')}</p>
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
          <span class="rate-row">
            <input
              id="set-fte"
              type="number"
              min="0"
              step="1"
              value={Math.round(settings.thresholds.maxFte * 100)}
              aria-invalid={errors['thresholds.maxFte'] ? 'true' : undefined}
              aria-describedby={describe('thresholds.maxFte')}
              onchange={(e) => onThreshold('maxFte', e)}
            />
            <span>%</span>
          </span>
          {@render err('thresholds.maxFte', $t('settings.maxFte'))}
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>{$t('settings.context')}</legend>
      <div class="field">
        <label for="set-context" id="set-context-label">{$t('settings.contextSwitch')}</label>
        <span class="rate-row">
          <input
            id="set-context"
            type="number"
            min={MIN_CONTEXT_SWITCH}
            max={LIMITS.teams}
            step="1"
            value={settings.thresholds.contextSwitch ?? DEFAULT_CONTEXT_SWITCH}
            aria-labelledby="set-context-label set-context-unit"
            aria-invalid={errors['thresholds.contextSwitch'] ? 'true' : undefined}
            aria-describedby={['set-context-hint', describe('thresholds.contextSwitch')]
              .filter(Boolean)
              .join(' ')}
            onchange={onContextSwitch}
          />
          <span id="set-context-unit">{$t('settings.contextSwitch.unit')}</span>
        </span>
        {@render err('thresholds.contextSwitch', $t('settings.contextSwitch'))}
        <p class="help" id="set-context-hint">{$t('settings.contextSwitch.hint')}</p>
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
            step="any"
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

    <fieldset>
      <legend>{$t('settings.levels')}</legend>
      <div class="field">
        <label for="set-levels">{$t('settings.levels.choice')}</label>
        <select
          id="set-levels"
          value={levelChoice}
          aria-describedby="note-levels"
          onchange={onLevelChoice}
        >
          {#each LEVEL_PRESETS as preset (preset)}
            <option value={preset}>{presetLabel(preset)}</option>
          {/each}
          <option value="custom">{$t('settings.levels.custom')}</option>
        </select>
        <p class="help" id="note-levels">{$t('settings.levels.help')}</p>
      </div>
      {#if settings.levelNames && !('preset' in settings.levelNames)}
        <div class="grid">
          {#each ['organisation', 'area', 'team'] as const as level (level)}
            <div class="field">
              <label for="set-level-{level}">{$t('settings.levels.' + level)}</label>
              <input
                id="set-level-{level}"
                type="text"
                maxlength={LIMITS.textChars}
                placeholder={level === 'organisation' ? $t('level.org') : undefined}
                value={settings.levelNames[level] ?? ''}
                aria-invalid={errors[`levelNames.${level}`] ? 'true' : undefined}
                aria-describedby={describe(`levelNames.${level}`)}
                onchange={(e) => onLevelName(level, e)}
              />
              {@render err(`levelNames.${level}`, $t('settings.levels.' + level))}
            </div>
          {/each}
        </div>
      {/if}
      {#if hasLine}
        <section class="line-levels" aria-labelledby="line-levels-title">
          <h3 id="line-levels-title">{$t('settings.lineLevels.title')}</h3>
          <p class="help" id="note-line-levels">{$t('settings.lineLevels.help')}</p>
          <ol class="levels">
            {#each lineList as level, i (level.id)}
              {@const used = lineUse[level.id] ?? 0}
              <li>
                <span class="step" aria-hidden="true">{i + 1}</span>
                <div class="level-main">
                  <label class="sr-only" for="set-line-{level.id}"
                    >{$t('settings.lineLevels.name', { n: i + 1 })}</label
                  >
                  <input
                    id="set-line-{level.id}"
                    type="text"
                    maxlength={LIMITS.textChars}
                    placeholder={lineLevelWord($levelStore, level.id)}
                    value={lineName(level)}
                    bind:this={lineInputs[i]}
                    aria-describedby="line-use-{level.id}"
                    onchange={(e) => onLineName(i, e)}
                  />
                  <span class="use" id="line-use-{level.id}">
                    {used === 0
                      ? $t('settings.lineLevels.unused')
                      : $t(
                          used === 1 ? 'settings.lineLevels.used.one' : 'settings.lineLevels.used',
                          {
                            n: used,
                          },
                        )}
                  </span>
                  {#if i === 0}
                    <label class="check">
                      <input
                        type="checkbox"
                        checked={level.company === true}
                        onchange={onCompanyLevel}
                      />
                      {$t('settings.lineLevels.company')}
                    </label>
                  {/if}
                </div>
                <div class="level-actions">
                  <button
                    type="button"
                    data-move="{level.id}:up"
                    aria-label={$t('settings.lineLevels.up', {
                      name: lineLevelWord($levelStore, level.id),
                    })}
                    disabled={i === 0 || lineList[i - 1]?.company || level.company}
                    onclick={() => moveLine(i, -1)}><span aria-hidden="true">↑</span></button
                  >
                  <button
                    type="button"
                    data-move="{level.id}:down"
                    aria-label={$t('settings.lineLevels.down', {
                      name: lineLevelWord($levelStore, level.id),
                    })}
                    disabled={i === lineList.length - 1 || level.company}
                    onclick={() => moveLine(i, 1)}><span aria-hidden="true">↓</span></button
                  >
                  <button
                    type="button"
                    aria-label={$t('settings.lineLevels.remove', {
                      name: lineLevelWord($levelStore, level.id),
                    })}
                    disabled={used > 0 || lineList.length === 1}
                    onclick={() => removeLine(i)}><span aria-hidden="true">✕</span></button
                  >
                </div>
              </li>
            {/each}
          </ol>
          {#if lineError}
            <p class="field-error" role="alert">
              {$t(lineError, { path: $t('settings.lineLevels.title') })}
            </p>
          {/if}
          <button
            type="button"
            class="secondary add-level"
            disabled={lineList.length >= LIMITS.lineLevels}
            onclick={addLine}
            ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{$t(
              'settings.lineLevels.add',
            )}</button
          >
        </section>
      {/if}
    </fieldset>
  </section>
</div>

<style>
  .line-levels {
    margin-top: var(--space);
  }
  .levels {
    list-style: none;
    margin: 0 0 var(--space);
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .levels li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.5rem 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }
  /* The level's place, top-down: the tree gets one step deeper per row. */
  .step {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    margin-top: 0.35rem;
    border-radius: 50%;
    background: var(--surface, var(--bg));
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .level-main {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .use {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .level-actions {
    display: flex;
    gap: 0.25rem;
  }
  /* Narrow: the buttons go below the name, in line with it. */
  @media (max-width: 40rem) {
    .level-actions {
      grid-column: 2;
    }
  }
  .level-actions button {
    min-width: 2.5rem;
    min-height: 2.5rem;
  }
  .add-level {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .add-level svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
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
  /* The appearance switch takes a row of its own: its three labels do not fit one column. */
  .wide {
    grid-column: 1 / -1;
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
