<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    holders,
    ORG_UNIT,
    unitName,
    type Area,
    type CalEvent,
    type Category,
    type Role,
    type Team,
  } from '../../core/model';
  import { areaHours } from '../../core/load';
  import { areaText, levels, translate } from '../../i18n';
  import { upsertEvent } from '../../core/edit';
  import { validate } from '../../core/validate';
  import { effectScope, whatIfEffect } from '../../core/whatIf';
  import { index, localToday, workspace } from '../state/workspace';
  import { RULE_TYPES, ruleDraft, toRule, type RuleDraft } from '../meetings/rules';
  import ParticipantReach from './ParticipantReach.svelte';
  import RuleFields from './RuleFields.svelte';
  import WhatIfEffect from './WhatIfEffect.svelte';

  let {
    event,
    team,
    categories,
    roles,
    save,
    cancel,
    area,
    onSetHours,
  }: {
    /** The event to edit; an empty `id` is a new event. */
    event: CalEvent;
    team: Team;
    categories: Category[];
    roles: Role[];
    /** Commits the event. Returns null on success, else error i18n keys by field path ('' = general). */
    save: (event: CalEvent, commit: boolean) => Record<string, string> | null;
    cancel: () => void;
    /** Set for a meeting of an area: each role is then invited in the area or from every team. */
    area?: Area;
    /** Opens where a person's area hours are set. */
    onSetHours?: (personId?: string) => void;
  } = $props();
  /** Area texts, worded for the organisation when it is the one shown (#328). */
  const tt = $derived(areaText($translate, $levels, area?.id ?? ''));
  /** A meeting of the organisation can also invite a role from every area (#328). */
  const inOrg = $derived(area?.id === ORG_UNIT);

  const uid = $props.id();
  const id = (field: string) => `${uid}-${field.replace(/\./g, '-')}`;

  interface Draft {
    name: string;
    categoryId: string;
    rule: RuleDraft;
    time: string;
    duration: number | null;
    scaled: boolean;
    base: number | null;
    perUnit: number | null;
    assumption: string;
    grid: number | null;
    /** `key` only tells the rows apart while editing; it is not saved. */
    participants: {
      key: number;
      roleId: string;
      share: number | null;
      fromTeams: boolean;
      /** Only in the organisation (#328): the role from every area. */
      fromAreas: boolean;
    }[];
    /** People invited by name (#285), saved after the roles. */
    people: { key: number; personId: string; share: number | null }[];
    /** Percent, 0 to 100. */
    preparation: number | null;
    /** On site rather than remote (#309), with travel minutes there and back for everyone. */
    onSite: boolean;
    travel: number | null;
    /** Room or online link (#442); empty means none. */
    place: string;
  }

  /** Travel time an on-site meeting starts with: half an hour there and back. */
  const DEFAULT_TRAVEL = 30;

  let nextKey = 0;
  let addButton: HTMLButtonElement | undefined = $state();
  let partsList: HTMLUListElement | undefined = $state();
  let addPersonButton: HTMLButtonElement | undefined = $state();
  let peopleList: HTMLUListElement | undefined = $state();

  function init(e: CalEvent): Draft {
    const s = e.scaling;
    return {
      name: e.name,
      categoryId: e.categoryId,
      rule: ruleDraft(e.rule, team, localToday()),
      time: e.time,
      duration: e.duration,
      scaled: s !== undefined,
      base: s?.base ?? 30,
      perUnit: s?.perUnit ?? 5,
      assumption: s?.assumption ?? Object.keys(team.assumptions)[0] ?? '',
      grid: s?.grid ?? 5,
      participants: e.participants.flatMap((p) =>
        p.roleId !== undefined
          ? [
              {
                key: nextKey++,
                roleId: p.roleId,
                share: p.share,
                fromTeams: !!p.fromTeams,
                fromAreas: !!p.fromAreas,
              },
            ]
          : [],
      ),
      people: e.participants.flatMap((p) =>
        p.personId !== undefined ? [{ key: nextKey++, personId: p.personId, share: p.share }] : [],
      ),
      preparation: Math.round(e.preparation * 10000) / 100,
      onSite: e.onSite !== undefined,
      travel: e.onSite?.travel ?? DEFAULT_TRAVEL,
      place: e.place ?? '',
    };
  }

  // The form edits a copy; the parent closes it (and so drops the copy) on any foreign change.
  let draft = $state<Draft>(untrack(() => init(event)));
  const heading = $derived(
    untrack(() => event.id) === ''
      ? tt('meet.form.new')
      : tt('meet.form.edit', { name: untrack(() => event.name) }),
  );
  let errors = $state<Record<string, string>>({});
  let form: HTMLFormElement | undefined;
  let nameInput: HTMLInputElement | undefined;

  onMount(() => nameInput?.focus());

  /** An area without a cadence has no cadence days to plan on (unless the meeting uses one). */
  const ruleTypes = $derived(
    area && !area.cadence
      ? RULE_TYPES.filter((r) => r !== 'cadence-day' || draft.rule.type === r)
      : RULE_TYPES,
  );
  const assumptionKeys = $derived(Object.keys(team.assumptions));
  /** The event scales by an assumption the team no longer has. */
  const staleAssumption = $derived(
    draft.assumption !== '' && !assumptionKeys.includes(draft.assumption),
  );
  const roleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? roleId;
  const personName = (personId: string) =>
    $workspace.people.find((x) => x.id === personId)?.name ?? personId;

  /** People of this team or area (an area's teams included) first, then everyone else. */
  const ownPeople = $derived.by(() => {
    const teams = area ? $workspace.teams.filter((x) => area.teamIds.includes(x.id)) : [];
    return new Set([team, ...teams].flatMap((x) => x.members.map((m) => m.personId)));
  });
  const herePeople = $derived($workspace.people.filter((x) => ownPeople.has(x.id)));
  const otherPeople = $derived($workspace.people.filter((x) => !ownPeople.has(x.id)));
  const namedIds = $derived(draft.people.map((x) => x.personId));

  /** The invited roles that also reach this person, for the "counts once" note under the row. */
  function alsoAs(personId: string): string[] {
    return draft.participants
      .filter((p) =>
        holders($workspace, team.id, {
          roleId: p.roleId,
          share: 1,
          fromTeams: p.fromTeams,
          fromAreas: p.fromAreas,
        }).includes(personId),
      )
      .map((p) => roleName(p.roleId));
  }

  const invalid = (field: string) => (errors[field] ? 'true' : undefined);
  const describe = (field: string, extra?: string) =>
    [errors[field] ? `${id(field)}-err` : undefined, extra].filter(Boolean).join(' ') || undefined;

  /** Editing a field makes its error stale (the rule type clears all rule errors). */
  function onEdit(e: Event) {
    const field = (e.target as HTMLElement).dataset.field;
    if (!field) return;
    const drop = (k: string) => (field === 'rule.type' ? k.startsWith('rule.') : k === field);
    if (Object.keys(errors).some(drop)) {
      errors = Object.fromEntries(Object.entries(errors).filter(([k]) => !drop(k)));
    }
  }

  /** Every row whose role or person is listed more than once. */
  function dupErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    draft.participants.forEach((p, i) => {
      if (draft.participants.some((o, j) => j !== i && o.roleId === p.roleId))
        out[`participants.${i}.roleId`] = 'meet.participants.duplicate';
    });
    draft.people.forEach((p, i) => {
      if (draft.people.some((o, j) => j !== i && o.personId === p.personId))
        out[`people.${i}.personId`] = 'meet.people.duplicate';
    });
    return out;
  }

  const rowError = (k: string) => k.startsWith('participants.') || k.startsWith('people.');

  /** Rows were added or removed: indices shifted, so drop the row errors and re-mark duplicates. */
  function clearParticipantErrors() {
    errors = {
      ...Object.fromEntries(Object.entries(errors).filter(([k]) => !rowError(k))),
      ...dupErrors(),
    };
  }

  /** The new row's role takes the focus (the add button may now be disabled). */
  async function addParticipant() {
    const free = roles.find((r) => !draft.participants.some((p) => p.roleId === r.id));
    if (!free) return;
    draft.participants.push({
      key: nextKey++,
      roleId: free.id,
      share: 1,
      // In an area, a role nobody holds there is most likely meant from the teams.
      fromTeams: !!area && !area.members.some((m) => m.roleId === free.id),
      fromAreas: false,
    });
    clearParticipantErrors();
    await tick();
    partsList?.querySelector<HTMLElement>('li:last-child select')?.focus();
  }

  /** The removed row's button is gone: focus moves to the add button. */
  async function removeParticipant(i: number) {
    draft.participants.splice(i, 1);
    clearParticipantErrors();
    await tick();
    addButton?.focus();
  }

  /** The new row offers the first person not listed yet, this team's people first. */
  async function addPerson() {
    const free = [...herePeople, ...otherPeople].find((x) => !namedIds.includes(x.id));
    if (!free) return;
    draft.people.push({ key: nextKey++, personId: free.id, share: 1 });
    clearParticipantErrors();
    await tick();
    peopleList?.querySelector<HTMLElement>('li:last-child select')?.focus();
  }

  async function removePerson(i: number) {
    draft.people.splice(i, 1);
    clearParticipantErrors();
    await tick();
    addPersonButton?.focus();
  }

  function onChange(e: Event) {
    onEdit(e);
    const field = (e.target as HTMLElement).dataset.field ?? '';
    if (/^(participants\.\d+\.roleId|people\.\d+\.personId)$/.test(field)) onRole();
  }

  /** A role changed: duplicate marks on every row are recomputed (both rows clear together). */
  function onRole() {
    errors = {
      ...Object.fromEntries(
        Object.entries(errors).filter(
          ([k, v]) =>
            !(
              rowError(k) &&
              (v === 'meet.participants.duplicate' || v === 'meet.people.duplicate')
            ),
        ),
      ),
      ...dupErrors(),
    };
  }

  const n = (v: number | null): number => v ?? Number.NaN;

  function build(): CalEvent {
    const d = draft;
    const out: CalEvent = {
      id: event.id,
      name: d.name.trim(),
      categoryId: d.categoryId,
      rule: toRule(d.rule),
      time: d.time.trim(),
      duration: n(d.duration),
      participants: [
        ...d.participants.map((p) => ({
          roleId: p.roleId,
          share: n(p.share),
          ...(area && p.fromTeams ? { fromTeams: true } : {}),
          ...(inOrg && p.fromAreas ? { fromAreas: true } : {}),
        })),
        ...d.people.map((p) => ({ personId: p.personId, share: n(p.share) })),
      ],
      preparation: Number.isNaN(n(d.preparation))
        ? Number.NaN
        : Number((n(d.preparation) / 100).toFixed(4)),
    };
    if (d.onSite) out.onSite = { travel: n(d.travel) };
    if (d.place.trim() !== '') out.place = d.place.trim();
    if (d.scaled)
      out.scaling = {
        base: n(d.base),
        perUnit: n(d.perUnit),
        assumption: d.assumption,
        grid: n(d.grid),
      };
    return out;
  }

  // The Wirkung box of present mode, live for the draft; nothing is committed here.
  const scope = $derived(effectScope($workspace, team.id));
  const rate = $derived($workspace.settings.hourlyRate);
  const before = $derived(scope ? whatIfEffect($workspace, $index, scope, rate) : undefined);
  // Only the fields that change the numbers: typing a name, time or category recomputes nothing.
  const effectKey = $derived(
    Object.keys(dupErrors()).length > 0
      ? ''
      : JSON.stringify({ ...build(), name: 'x', time: '09:00', categoryId: event.categoryId }),
  );
  const drafted = $derived.by(() => {
    if (!scope || !effectKey) return undefined;
    const checked = validate(upsertEvent($workspace, team.id, JSON.parse(effectKey))[0]);
    return checked.ok ? checked.value : undefined;
  });
  const after = $derived(scope && drafted ? whatIfEffect(drafted, $index, scope, rate) : undefined);
  /** A team in an area: its own load comes first, the area's can round to the same (#340). */
  const own = $derived.by(() => {
    if (!drafted || scope === team.id) return undefined;
    const b = whatIfEffect($workspace, $index, team.id, rate);
    const a = whatIfEffect(drafted, $index, team.id, rate);
    return b && a ? { name: team.name, before: b, after: a } : undefined;
  });
  const scopeName = $derived(unitName($workspace, scope, $levels.org));

  async function submit(e: Event) {
    e.preventDefault();
    const found = dupErrors();
    if (draft.scaled && staleAssumption) found['scaling.assumption'] = 'error.ref.unknown';
    // A refused field is never committed, but the other fields are still checked.
    const result = save(build(), Object.keys(found).length === 0);
    if (result === null && Object.keys(found).length === 0) return;
    errors = { ...rowPaths(result ?? {}), ...found };
    await tick();
    // A weekday group has no aria-invalid (it is a fieldset), so its first checkbox takes the focus.
    const first = form?.querySelector<HTMLElement>(
      '[aria-invalid="true"], fieldset[aria-describedby] input',
    );
    (first ?? form?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
  }

  /** Saved rows list the roles, then the people: a person's error moves to its own row. */
  function rowPaths(result: Record<string, string>): Record<string, string> {
    const roleRows = draft.participants.length;
    return Object.fromEntries(
      Object.entries(result).map(([k, v]) => {
        const m = /^participants\.(\d+)\.(.*)$/.exec(k);
        const i = m ? Number(m[1]) : -1;
        return m && i >= roleRows ? [`people.${i - roleRows}.${m[2]}`, v] : [k, v];
      }),
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    e.preventDefault();
    cancel();
  }
</script>

{#snippet err(field: string, label: string)}
  {#if errors[field]}
    <p class="field-error" id="{id(field)}-err">{tt(errors[field]!, { path: label })}</p>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="eventform" aria-labelledby="{uid}-h" onkeydown={onKeydown}>
  <h3 id="{uid}-h">{heading}</h3>
  <form bind:this={form} novalidate onsubmit={submit} oninput={onEdit} onchange={onChange}>
    {#if errors['']}
      <p class="field-error" role="alert" tabindex="-1">{tt(errors[''], { path: heading })}</p>
    {/if}
    <div class="row">
      <div class="field grow">
        <label for={id('name')}>{tt('meet.name')}</label>
        <input
          id={id('name')}
          type="text"
          data-field="name"
          bind:this={nameInput}
          bind:value={draft.name}
          aria-invalid={invalid('name')}
          aria-describedby={describe('name')}
        />
        {@render err('name', tt('meet.name'))}
      </div>
      <div class="field">
        <label for={id('categoryId')}>{tt('meet.category')}</label>
        <select
          id={id('categoryId')}
          data-field="categoryId"
          bind:value={draft.categoryId}
          aria-invalid={invalid('categoryId')}
          aria-describedby={describe('categoryId')}
        >
          {#each categories as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
        {@render err('categoryId', tt('meet.category'))}
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label for={id('rule.type')}>{tt('meet.ruletype')}</label>
        <select
          id={id('rule.type')}
          data-field="rule.type"
          bind:value={draft.rule.type}
          aria-invalid={invalid('rule.type')}
          aria-describedby={describe('rule.type')}
        >
          {#each ruleTypes as r (r)}
            <option value={r}>{tt(`meet.ruletype.${r}`)}</option>
          {/each}
        </select>
        {@render err('rule.type', tt('meet.ruletype'))}
      </div>
      <RuleFields bind:draft={draft.rule} {team} {errors} idPrefix={uid} />
    </div>

    <div class="row">
      <div class="field">
        <label for={id('time')}>{tt('meet.time')}</label>
        <input
          id={id('time')}
          type="text"
          inputmode="numeric"
          autocomplete="off"
          data-field="time"
          bind:value={draft.time}
          aria-invalid={invalid('time')}
          aria-describedby={describe('time')}
        />
        {@render err('time', tt('meet.time'))}
      </div>
      <div class="field">
        <label for={id('duration')}>{tt('meet.duration')}</label>
        <input
          id={id('duration')}
          type="number"
          min="1"
          step="1"
          data-field="duration"
          bind:value={draft.duration}
          aria-invalid={invalid('duration')}
          aria-describedby={describe('duration')}
        />
        {@render err('duration', tt('meet.duration'))}
      </div>
      <div class="field">
        <label for={id('preparation')}>{tt('meet.prep')}</label>
        <input
          id={id('preparation')}
          type="number"
          min="0"
          max="100"
          step="5"
          data-field="preparation"
          bind:value={draft.preparation}
          aria-invalid={invalid('preparation')}
          aria-describedby={describe('preparation', `${id('preparation')}-hint`)}
        />
        <p class="hint" id="{id('preparation')}-hint">{tt('meet.prep.hint')}</p>
        {@render err('preparation', tt('meet.prep'))}
      </div>
    </div>

    <div class="row">
      <div class="field">
        <span class="label" id={id('place.kind')}>{tt('meet.place')}</span>
        <div class="segmented" role="group" aria-labelledby={id('place.kind')}>
          <button
            type="button"
            data-field="place.remote"
            aria-pressed={!draft.onSite}
            onclick={() => (draft.onSite = false)}>{tt('meet.place.remote')}</button
          >
          <button
            type="button"
            data-field="place.onSite"
            aria-pressed={draft.onSite}
            onclick={() => (draft.onSite = true)}>{tt('meet.place.onSite')}</button
          >
        </div>
      </div>
      {#if draft.onSite}
        <div class="field">
          <label for={id('onSite.travel')}>{tt('meet.travel')}</label>
          <input
            id={id('onSite.travel')}
            type="number"
            min="0"
            step="5"
            data-field="onSite.travel"
            bind:value={draft.travel}
            aria-invalid={invalid('onSite.travel')}
            aria-describedby={describe('onSite.travel', `${id('onSite.travel')}-hint`)}
          />
          <p class="hint" id="{id('onSite.travel')}-hint">{tt('meet.travel.hint')}</p>
          {@render err('onSite.travel', tt('meet.travel'))}
        </div>
      {/if}
      <div class="field">
        <label for={id('place')}>{tt('meet.placeText')}</label>
        <input
          id={id('place')}
          type="text"
          maxlength="200"
          data-field="place"
          bind:value={draft.place}
          placeholder={tt(draft.onSite ? 'meet.placeText.room' : 'meet.placeText.link')}
          aria-invalid={invalid('place')}
          aria-describedby={describe('place', `${id('place')}-hint`)}
        />
        <p class="hint" id="{id('place')}-hint">{tt('meet.placeText.hint')}</p>
        {@render err('place', tt('meet.placeText'))}
      </div>
    </div>

    <!-- Areas have no assumptions to scale by. -->
    <fieldset hidden={!!area && !draft.scaled}>
      <legend>{tt('meet.scaling')}</legend>
      <label class="check">
        <input type="checkbox" data-field="scaling" bind:checked={draft.scaled} />
        <span>{tt('meet.scaling.enable')}</span>
      </label>
      {#if draft.scaled}
        <div class="row">
          <div class="field">
            <label for={id('scaling.base')}>{tt('meet.scaling.base')}</label>
            <input
              id={id('scaling.base')}
              type="number"
              min="0"
              step="1"
              data-field="scaling.base"
              bind:value={draft.base}
              aria-invalid={invalid('scaling.base')}
              aria-describedby={describe('scaling.base')}
            />
            {@render err('scaling.base', tt('meet.scaling.base'))}
          </div>
          <div class="field">
            <label for={id('scaling.perUnit')}>{tt('meet.scaling.perUnit')}</label>
            <input
              id={id('scaling.perUnit')}
              type="number"
              min="0"
              step="any"
              data-field="scaling.perUnit"
              bind:value={draft.perUnit}
              aria-invalid={invalid('scaling.perUnit')}
              aria-describedby={describe('scaling.perUnit')}
            />
            {@render err('scaling.perUnit', tt('meet.scaling.perUnit'))}
          </div>
          <div class="field">
            <label for={id('scaling.assumption')}>{tt('meet.scaling.assumption')}</label>
            <select
              id={id('scaling.assumption')}
              data-field="scaling.assumption"
              bind:value={draft.assumption}
              aria-invalid={invalid('scaling.assumption')}
              aria-describedby={describe(
                'scaling.assumption',
                assumptionKeys.length === 0 ? `${id('scaling.assumption')}-hint` : undefined,
              )}
            >
              {#if assumptionKeys.length === 0 || staleAssumption}<option value=""
                  >{tt('meet.option.none')}</option
                >{/if}
              {#each assumptionKeys as k (k)}
                <option value={k}>{k}</option>
              {/each}
            </select>
            {#if assumptionKeys.length === 0}
              <p class="hint" id="{id('scaling.assumption')}-hint">{tt('meet.scaling.none')}</p>
            {/if}
            {@render err('scaling.assumption', tt('meet.scaling.assumption'))}
          </div>
          <div class="field">
            <label for={id('scaling.grid')}>{tt('meet.scaling.grid')}</label>
            <input
              id={id('scaling.grid')}
              type="number"
              min="1"
              step="any"
              data-field="scaling.grid"
              bind:value={draft.grid}
              aria-invalid={invalid('scaling.grid')}
              aria-describedby={describe('scaling.grid')}
            />
            {@render err('scaling.grid', tt('meet.scaling.grid'))}
          </div>
        </div>
      {/if}
    </fieldset>

    <fieldset>
      <legend>{tt('meet.participants')}</legend>
      <p class="hint" id="{uid}-share-hint">
        {tt('meet.participants.hint')}{#if inOrg}. {tt('org.participants.hint')}{:else if area}. {tt(
            'area.participants.hint',
          )}{/if}
      </p>
      {#if roles.length === 0}
        <p class="hint">{tt('meet.participants.noroles')}</p>
      {:else if draft.participants.length === 0}
        <p class="hint">{tt('meet.participants.empty')}</p>
      {/if}
      {#if draft.participants.length > 0}
        <!-- Column heads once; every field is named by its own aria-label. -->
        <div class="parts-wrap" class:in-area={!!area}>
          <div class="part-grid part-heads" aria-hidden="true">
            <span>{tt('meet.participants.role')}</span>{#if area}<span
                >{tt('area.participants.who')}</span
              >{/if}<span>{tt('meet.participants.share')}</span>
          </div>
          <ul class="parts" bind:this={partsList}>
            {#each draft.participants as p, i (p.key)}
              <li class="part-grid">
                <div class="field role">
                  <select
                    id={id(`participants.${i}.roleId`)}
                    data-field="participants.{i}.roleId"
                    bind:value={p.roleId}
                    aria-label={tt('meet.participants.role')}
                    aria-invalid={invalid(`participants.${i}.roleId`)}
                    aria-describedby={describe(`participants.${i}.roleId`)}
                  >
                    {#each roles as r (r.id)}
                      <option value={r.id}>{r.name}</option>
                    {/each}
                  </select>
                </div>
                {#if area}
                  <div class="field who">
                    <select
                      class:from-teams={p.fromTeams || p.fromAreas}
                      data-field="participants.{i}.fromTeams"
                      value={p.fromAreas ? 'areas' : p.fromTeams ? 'teams' : 'area'}
                      onchange={(e) => {
                        p.fromTeams = e.currentTarget.value === 'teams';
                        p.fromAreas = e.currentTarget.value === 'areas';
                      }}
                      aria-label={tt('area.participants.whoOf', { role: roleName(p.roleId) })}
                    >
                      <option value="area">{tt('area.participants.inArea')}</option>
                      {#if inOrg}
                        <option value="areas">{tt('org.participants.fromAreas')}</option>
                      {/if}
                      <option value="teams">{tt('area.participants.fromTeams')}</option>
                    </select>
                  </div>
                {/if}
                <span class="share-label" aria-hidden="true">{tt('meet.participants.share')}</span>
                <div class="field share">
                  <input
                    id={id(`participants.${i}.share`)}
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    data-field="participants.{i}.share"
                    bind:value={p.share}
                    aria-label={tt('meet.participants.shareOf', { role: roleName(p.roleId) })}
                    aria-invalid={invalid(`participants.${i}.share`)}
                    aria-describedby={describe(`participants.${i}.share`, `${uid}-share-hint`)}
                  />
                </div>
                <button
                  type="button"
                  class="icon-button remove"
                  aria-label={tt('meet.participants.remove', { role: roleName(p.roleId) })}
                  onclick={() => removeParticipant(i)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M6 6l12 12M18 6L6 18" /></svg
                  ></button
                >
                <!-- Errors span the row below its fields. -->
                {@render err(`participants.${i}.roleId`, roleName(p.roleId))}
                {@render err(`participants.${i}.share`, roleName(p.roleId))}
                {@render err(`participants.${i}.fromTeams`, roleName(p.roleId))}
                {@render err(`participants.${i}.fromAreas`, roleName(p.roleId))}
                {#if area}
                  <ParticipantReach
                    ws={$workspace}
                    {area}
                    roleId={p.roleId}
                    fromTeams={p.fromTeams}
                    fromAreas={p.fromAreas}
                    named={namedIds}
                    {onSetHours}
                  />
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <button
        type="button"
        class="secondary add"
        bind:this={addButton}
        disabled={roles.length === 0 || draft.participants.length >= roles.length}
        onclick={addParticipant}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{tt(
          'meet.participants.add',
        )}</button
      >
    </fieldset>

    <fieldset class="people">
      <legend>{tt('meet.people')}</legend>
      <p class="hint" id="{uid}-people-hint">{tt('meet.people.hint')}</p>
      {#if $workspace.people.length === 0}
        <p class="hint">{tt('meet.people.none')}</p>
      {/if}
      {#if draft.people.length > 0}
        <div class="parts-wrap">
          <div class="part-grid part-heads" aria-hidden="true">
            <span>{tt('meet.people.person')}</span><span>{tt('meet.participants.share')}</span>
          </div>
          <ul class="parts" bind:this={peopleList}>
            {#each draft.people as p, i (p.key)}
              {@const also = alsoAs(p.personId)}
              <li class="part-grid">
                <div class="field role">
                  <select
                    id={id(`people.${i}.personId`)}
                    data-field="people.{i}.personId"
                    bind:value={p.personId}
                    aria-label={tt('meet.people.person')}
                    aria-invalid={invalid(`people.${i}.personId`)}
                    aria-describedby={describe(
                      `people.${i}.personId`,
                      [`${uid}-people-hint`, also.length > 0 ? `${uid}-also-${p.key}` : '']
                        .filter(Boolean)
                        .join(' '),
                    )}
                  >
                    {#if herePeople.length > 0}
                      <optgroup label={tt('meet.people.here', { unit: team.name })}>
                        {#each herePeople as x (x.id)}
                          <option value={x.id}>{x.name}</option>
                        {/each}
                      </optgroup>
                    {/if}
                    {#if otherPeople.length > 0}
                      <optgroup label={tt('meet.people.others')}>
                        {#each otherPeople as x (x.id)}
                          <option value={x.id}>{x.name}</option>
                        {/each}
                      </optgroup>
                    {/if}
                  </select>
                </div>
                <span class="share-label" aria-hidden="true">{tt('meet.participants.share')}</span>
                <div class="field share">
                  <input
                    id={id(`people.${i}.share`)}
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    data-field="people.{i}.share"
                    bind:value={p.share}
                    aria-label={tt('meet.participants.shareOf', { role: personName(p.personId) })}
                    aria-invalid={invalid(`people.${i}.share`)}
                    aria-describedby={describe(`people.${i}.share`, `${uid}-share-hint`)}
                  />
                </div>
                <button
                  type="button"
                  class="icon-button remove"
                  aria-label={tt('meet.people.remove', { name: personName(p.personId) })}
                  onclick={() => removePerson(i)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M6 6l12 12M18 6L6 18" /></svg
                  ></button
                >
                {@render err(`people.${i}.personId`, personName(p.personId))}
                {@render err(`people.${i}.share`, personName(p.personId))}
                {#if also.length > 0}
                  <p class="also" id="{uid}-also-{p.key}">
                    {tt('meet.people.alsoRole', { role: also.join(', ') })}
                  </p>
                {/if}
                <!-- No hours in the area yet: a hint under Meeting load, as for "from every team" (#307). -->
                {#if area && areaHours($workspace, area.id, p.personId) === 0}
                  <p class="also no-hours" role="note">
                    {tt('area.participants.noHours.one', { names: personName(p.personId) })}
                    {#if onSetHours}
                      <button type="button" class="link" onclick={() => onSetHours(p.personId)}
                        >{tt('area.participants.setHours')}</button
                      >
                    {/if}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <button
        type="button"
        class="secondary add"
        bind:this={addPersonButton}
        disabled={draft.people.length >= $workspace.people.length}
        onclick={addPerson}
        ><svg viewBox="0 0 24 24" aria-hidden="true"
          ><circle cx="10" cy="8" r="3.5" /><path
            d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"
          /></svg
        >{tt('meet.people.add')}</button
      >
    </fieldset>

    {#if scope}
      <div class="live-effect">
        <WhatIfEffect
          {before}
          {after}
          {scopeName}
          team={own}
          cadence={team.cadence}
          compact
          live={false}
          error={after ? undefined : tt('meet.effect.invalid')}
        />
      </div>
    {/if}

    <div class="actions">
      <button type="submit" class="primary">{tt('meet.save')}</button>
      <button type="button" onclick={cancel}>{tt('meet.cancel')}</button>
    </div>
  </form>
</section>

<style>
  .eventform {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space);
    margin-block: var(--space);
  }
  h3 {
    margin-top: 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 1rem;
    margin-block: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .grow {
    flex: 1 1 14rem;
  }
  /* The place group has no <label>: it looks like one. */
  .label {
    font-size: 0.85rem;
    font-weight: 550;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0.75rem 0;
    padding: 0.5rem var(--space) var(--space);
    min-width: 0;
  }
  legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .live-effect {
    margin-top: var(--space);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: var(--space);
  }
  select,
  input[type='number'],
  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    min-width: 0;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  /* Participants: one aligned row per role, column heads once. A narrow form (a phone) gives
     the role a row of its own, and the share its own label. */
  .parts-wrap {
    container-type: inline-size;
  }
  .part-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5rem 2.5rem;
    grid-template-areas: 'role share remove';
    gap: 0.4rem;
    align-items: center;
    max-width: 34rem;
  }
  .in-area .part-grid {
    grid-template-columns: minmax(0, 1fr) minmax(9rem, 12rem) 5rem 2.5rem;
    grid-template-areas: 'role who share remove';
    max-width: 44rem;
  }
  .part-grid .who {
    grid-area: who;
  }
  :global(#app) .who select.from-teams {
    border-color: var(--area);
    background-color: var(--area-soft);
    color: var(--area);
    font-weight: 600;
  }
  .part-grid > .field-error,
  .part-grid > .also {
    grid-column: 1 / -1;
    margin: 0;
  }
  .also {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .no-hours {
    width: fit-content;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--warn-soft);
    color: var(--warn);
    font-weight: 600;
  }
  :global(#app) .no-hours button.link {
    border: 0;
    background: none;
    padding: 0;
    min-height: 0;
    min-width: 0;
    font: inherit;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .part-grid > .field-error {
    grid-column: 1 / -1;
    margin: 0;
  }
  .part-grid .role {
    grid-area: role;
  }
  .part-grid .share {
    grid-area: share;
  }
  .part-grid .remove {
    grid-area: remove;
  }
  .share-label {
    display: none;
    grid-area: label;
    align-self: center;
    justify-self: end;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  @container (max-width: 22rem) {
    .part-heads > :last-child {
      display: none;
    }
    .parts .part-grid {
      grid-template-areas:
        'role role remove'
        'label share .';
    }
    .parts > li + li {
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
    }
    .share-label {
      display: block;
    }
  }
  /* "Who" takes the role's width, so its options are never cut off (#431); the share below it
     gets its own label. */
  @container (max-width: 30rem) {
    .in-area .part-heads {
      display: none;
    }
    .in-area .parts .part-grid {
      grid-template-columns: minmax(0, 1fr) 5rem 2.5rem;
      grid-template-areas:
        'role role remove'
        'who who .'
        'label share .';
    }
    .in-area .share-label {
      display: block;
    }
    .in-area .parts > li + li {
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
    }
  }
  .part-heads {
    margin-top: 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .parts {
    list-style: none;
    margin: 0.3rem 0 0.75rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .parts select,
  .parts input {
    width: 100%;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.25rem;
  }
  .parts svg,
  .add svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
