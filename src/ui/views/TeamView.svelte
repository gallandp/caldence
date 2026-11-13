<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { diffDays } from '../../core/date';
  import {
    addItem,
    newId,
    removeCycle,
    renameAssumption,
    updateTeam,
    upsertCycle,
  } from '../../core/edit';
  import { record } from '../../core/record';
  import ColourField, { PALETTE } from '../components/ColourField.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import type { Cadence, Cycle } from '../../core/model';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import { initials, inkOn } from '../avatar';
  import { activeTeamId, localToday, workspace, type Change } from '../state/workspace';

  const uid = $props.id();

  const team = $derived($workspace.teams.find((x) => x.id === $activeTeamId));
  const personName = $derived(
    (id: string) => $workspace.people.find((p) => p.id === id)?.name ?? id,
  );
  const roleName = $derived((id: string) => $workspace.roles.find((r) => r.id === id)?.name ?? id);

  type Problem = { key: string; path: string; params?: Record<string, string | number> };
  let errors = $state<Record<string, Problem>>({});
  /** Bumped when drafts must be dropped (a foreign workspace change or another team). */
  let epoch = $state(0);

  // Errors and drafts belong to this view's own refused commits; undo, open, new or a team switch
  // make them stale.
  let own = false;
  onMount(() => {
    const stop = [
      workspace.subscribe(() => {
        if (own) return;
        errors = {};
        epoch++;
      }),
      activeTeamId.subscribe(() => {
        errors = {};
        epoch++;
      }),
    ];
    return () => stop.forEach((fn) => fn());
  });

  /** Commits a change; on refusal shows the first error under `id` (with `label` as its path). */
  function commit(id: string, label: string, change: Change): boolean {
    own = true;
    let result;
    try {
      result = workspace.apply(change);
    } finally {
      own = false;
    }
    const rest = { ...errors };
    delete rest[id];
    if (result.ok) {
      errors = rest;
      return true;
    }
    errors = { ...rest, [id]: { key: result.errors[0]?.key ?? 'error.type', path: label } };
    return false;
  }

  function fail(id: string, key: string, label: string, params?: Problem['params']) {
    errors = { ...errors, [id]: { key, path: label, params } };
  }

  function clearError(id: string) {
    const rest = { ...errors };
    delete rest[id];
    errors = rest;
  }

  const dom = (id: string) => `${uid}-${id.replace(/[^\w-]/g, '_')}`;
  const describe = (id: string) => (errors[id] ? `${dom(id)}-err` : undefined);

  let root: HTMLElement | undefined;
  async function focusSoon(selector: string) {
    await tick();
    root?.querySelector<HTMLElement>(selector)?.focus();
  }

  // ---------- members ----------

  const people = $derived($workspace.people);
  const roles = $derived($workspace.roles);
  const defaultHours = $derived($workspace.settings.hoursPerWeek);
  /** The team's members, one entry per person with their roles in member order. */
  const grouped = $derived.by(() => {
    const out: { personId: string; roleIds: string[] }[] = [];
    for (const m of team?.members ?? []) {
      const entry = out.find((x) => x.personId === m.personId);
      if (entry) entry.roleIds.push(m.roleId);
      else out.push({ personId: m.personId, roleIds: [m.roleId] });
    }
    return out;
  });
  const hoursOf = (personId: string): number =>
    team && Object.hasOwn(team.memberHours, personId) ? team.memberHours[personId]! : defaultHours;

  let addName = $state('');
  let addRole = $state('');
  let addHours = $state<number | null>(null);
  const roleChoice = $derived(roles.some((r) => r.id === addRole) ? addRole : (roles[0]?.id ?? ''));
  /** People who are not in this team yet, offered while typing a name. */
  const others = $derived(people.filter((p) => !grouped.some((g) => g.personId === p.id)));

  function withHours(hours: Record<string, number>, personId: string, h: number) {
    return Object.assign(record<number>(), hours, { [personId]: h });
  }

  function addMember(event: Event) {
    event.preventDefault();
    if (!team || roleChoice === '') return;
    const name = addName.trim();
    if (name === '') return fail('member-add', 'error.required', $t('team.members.person'));
    const hours = addHours ?? defaultHours;
    if (!Number.isFinite(hours) || hours < 0)
      return fail('member-add', 'error.number.invalid', $t('team.members.hours'));
    const { id, members, memberHours } = team;
    const known = people.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (known && members.some((m) => m.personId === known.id && m.roleId === roleChoice))
      return fail('member-add', 'team.members.duplicate', '');
    const done = commit('member-add', $t('team.members.hours'), (ws) => {
      let next = ws;
      let personId = known?.id;
      if (personId === undefined) [next, personId] = addItem(next, 'people', { name });
      return updateTeam(next, id, {
        members: [...members, { personId, roleId: roleChoice }],
        memberHours: withHours(memberHours, personId, hours),
      });
    });
    if (done) {
      addName = '';
      addHours = null;
      void focusSoon('[data-member-add]');
    }
  }

  function removeMember(personId: string, roleId: string) {
    if (!team) return;
    const { id, members, memberHours } = team;
    clearError('member-add');
    const rest = members.filter((m) => !(m.personId === personId && m.roleId === roleId));
    const hours = Object.assign(record<number>(), memberHours);
    // The person's hours in this team go with their last role.
    if (!rest.some((m) => m.personId === personId)) delete hours[personId];
    const done = commit('member-remove', '', (ws) =>
      updateTeam(ws, id, { members: rest, memberHours: hours }),
    );
    if (done) void focusSoon('[data-member-add]');
  }

  function setHours(personId: string, event: Event) {
    if (!team) return;
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const label = $t('team.members.hoursOf', { name: personName(personId), team: team.name });
    if (input.value.trim() === '' || !Number.isFinite(n))
      return fail(`hours-${personId}`, 'error.number.invalid', label);
    const { id, memberHours } = team;
    commit(`hours-${personId}`, label, (ws) =>
      updateTeam(ws, id, { memberHours: withHours(memberHours, personId, n) }),
    );
  }

  /** "Alpha 20 h · Beta 18 h · Σ 38 h", or that the person is in no team. */
  function teamsOf(personId: string): string {
    const parts = $workspace.teams
      .filter((x) => x.members.some((m) => m.personId === personId))
      .map((x) => ({
        name: x.name,
        h: Object.hasOwn(x.memberHours, personId) ? x.memberHours[personId]! : defaultHours,
      }));
    if (parts.length === 0) return $t('team.people.noTeam');
    const list = parts.map((x) => $t('team.people.inTeam', { team: x.name, hours: hours(x.h) }));
    if (parts.length > 1)
      list.push($t('team.people.sum', { hours: hours(parts.reduce((s, x) => s + x.h, 0)) }));
    return list.join(' · ');
  }
  const hours = (n: number): string =>
    new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n);

  function confirmPerson(person: { id: string; name: string }) {
    const count = $workspace.teams.filter((x) =>
      x.members.some((m) => m.personId === person.id),
    ).length;
    if (count === 0) return null;
    return {
      title: $t('settings.people.confirm.title', { name: person.name }),
      message: $t('settings.people.confirm.message', { name: person.name, count }),
    };
  }

  // ---------- cadence ----------

  function setCadence(field: keyof Cadence, label: string, patch: Partial<Cadence>) {
    if (!team) return;
    const { id, cadence } = team;
    commit(`cadence-${field}`, label, (ws) =>
      updateTeam(ws, id, { cadence: { ...cadence, ...patch } }),
    );
  }

  function onLength(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    const label = $t('team.cadence.length');
    if (input.value.trim() === '' || !Number.isFinite(n))
      return fail('cadence-lengthWeeks', 'error.number.invalid', label);
    const beyond = team?.events.find((e) => e.rule.type === 'cadence-day' && e.rule.day >= n * 7);
    if (beyond && beyond.rule.type === 'cadence-day')
      return fail('cadence-lengthWeeks', 'team.cadence.dayBeyond', label, {
        name: beyond.name,
        day: beyond.rule.day + 1,
        weeks: n,
      });
    setCadence('lengthWeeks', label, { lengthWeeks: n });
  }

  function onStart(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    const label = $t('team.cadence.start');
    if (value === '') return fail('cadence-start', 'error.required', label);
    setCadence('start', label, { start: value });
  }

  // ---------- cycles ----------

  let newCycle = $state('');

  function saveCycle(errorId: string, label: string, cycle: Cycle): boolean {
    if (!team) return false;
    const teamId = team.id;
    return commit(errorId, label, (ws) => upsertCycle(ws, teamId, cycle));
  }

  function addCycle(event: Event) {
    event.preventDefault();
    const name = newCycle.trim();
    const label = $t('team.cycles.new');
    if (name === '') return fail('cycle-add', 'list.error.empty', label);
    if (saveCycle('cycle-add', label, { id: '', name, milestones: [] })) newCycle = '';
  }

  function renameCycle(cycle: Cycle, event: Event) {
    const name = (event.currentTarget as HTMLInputElement).value.trim();
    if (name === '') return fail(`cycle-${cycle.id}`, 'list.error.empty', cycle.name);
    saveCycle(`cycle-${cycle.id}`, cycle.name, { ...cycle, name });
  }

  function deleteCycle(cycle: Cycle) {
    if (!team) return;
    const teamId = team.id;
    const done = commit(`cycle-${cycle.id}`, cycle.name, (ws) => removeCycle(ws, teamId, cycle.id));
    if (done) void focusSoon('[data-cycle-add]');
  }

  type Draft = { name: string; date: string };
  let drafts = $state<Record<string, Draft>>({});
  const draftOf = (cycleId: string): Draft => drafts[cycleId] ?? { name: '', date: '' };

  function addMilestone(cycle: Cycle, event: Event) {
    event.preventDefault();
    const draft = draftOf(cycle.id);
    const name = draft.name.trim();
    const errorId = `ms-add-${cycle.id}`;
    if (name === '') return fail(errorId, 'list.error.empty', $t('team.milestone.new'));
    if (draft.date === '') return fail(errorId, 'error.required', $t('team.milestone.newDate'));
    const id = newId(
      'm',
      cycle.milestones.map((m) => m.id),
    );
    const milestones = [...cycle.milestones, { id, name, date: draft.date }];
    if (saveCycle(errorId, name, { ...cycle, milestones }))
      drafts[cycle.id] = { name: '', date: '' };
  }

  function editMilestone(cycle: Cycle, id: string, patch: Partial<{ name: string; date: string }>) {
    const current = cycle.milestones.find((m) => m.id === id);
    if (!current) return;
    const milestones = cycle.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m));
    saveCycle(`ms-${cycle.id}-${id}`, current.name, { ...cycle, milestones });
  }

  function renameMilestone(cycle: Cycle, id: string, event: Event) {
    const name = (event.currentTarget as HTMLInputElement).value.trim();
    const label = $t('team.milestone.name');
    if (name === '') return fail(`ms-${cycle.id}-${id}`, 'list.error.empty', label);
    editMilestone(cycle, id, { name });
  }

  function redateMilestone(cycle: Cycle, id: string, event: Event) {
    const date = (event.currentTarget as HTMLInputElement).value;
    if (date === '')
      return fail(`ms-${cycle.id}-${id}`, 'error.required', $t('team.milestone.date'));
    editMilestone(cycle, id, { date });
  }

  function removeMilestone(cycle: Cycle, id: string) {
    const current = cycle.milestones.find((m) => m.id === id);
    if (!current) return;
    const milestones = cycle.milestones.filter((m) => m.id !== id);
    const done = saveCycle(`ms-list-${cycle.id}`, current.name, { ...cycle, milestones });
    if (done) void focusSoon(`[data-ms-add="${cycle.id}"]`);
  }

  // ---------- assumptions ----------

  let newKey = $state('');
  let newValue = $state('');

  function parseValue(raw: string): number | null {
    const n = Number(raw);
    return raw.trim() === '' || !Number.isFinite(n) ? null : n;
  }

  function addAssumption(event: Event) {
    event.preventDefault();
    if (!team) return;
    const { id, assumptions } = team;
    const key = newKey.trim();
    if (key === '') return fail('as-add', 'team.assumption.error.empty', $t('team.assumption.new'));
    if (Object.hasOwn(assumptions, key))
      return fail('as-add', 'error.id.duplicate', $t('team.assumption.new'));
    const value = parseValue(newValue);
    if (value === null)
      return fail('as-add', 'error.number.invalid', $t('team.assumption.newValue'));
    if (
      commit('as-add', key, (ws) =>
        updateTeam(ws, id, { assumptions: { ...assumptions, [key]: value } }),
      )
    ) {
      newKey = '';
      newValue = '';
    }
  }

  function revalue(key: string, event: Event) {
    if (!team) return;
    const { id, assumptions } = team;
    const value = parseValue((event.currentTarget as HTMLInputElement).value);
    if (value === null)
      return fail(`as-${key}`, 'error.number.invalid', $t('team.assumption.value'));
    commit(`as-${key}`, key, (ws) =>
      updateTeam(ws, id, { assumptions: { ...assumptions, [key]: value } }),
    );
  }

  async function rekey(key: string, event: Event) {
    if (!team) return;
    const teamId = team.id;
    const next = (event.currentTarget as HTMLInputElement).value.trim();
    if (next === '')
      return fail(`as-${key}`, 'team.assumption.error.empty', $t('team.assumption.key'));
    if (next === key) return;
    if (
      commit(`as-${key}`, $t('team.assumption.key'), (ws) =>
        renameAssumption(ws, teamId, key, next),
      )
    )
      await focusSoon(`[data-as-key="${CSS.escape(next)}"]`);
  }

  function removeAssumption(key: string) {
    if (!team) return;
    const { id, assumptions } = team;
    const rest = { ...assumptions };
    delete rest[key];
    const done = commit(`as-${key}`, key, (ws) => updateTeam(ws, id, { assumptions: rest }));
    if (done) void focusSoon('[data-as-add]');
  }

  const cadenceKinds = ['sprint', 'flow', 'pi'] as const;

  // ---------- presentation ----------

  /** A member's initials take the colour of the role. */
  const roleColour = (id: string) => roles.find((r) => r.id === id)?.colour ?? '#64748b';

  /** Position of a date on the planning horizon in %, or null outside of it. */
  const horizon = $derived($workspace.settings.horizon);
  function onHorizon(date: string): number | null {
    const span = diffDays(horizon.to, horizon.from);
    if (span <= 0 || date < horizon.from || date > horizon.to) return null;
    return (diffDays(date, horizon.from) / span) * 100;
  }
  // The fill up to today moves on while the view stays open.
  let today = $state(localToday());
  onMount(() => {
    const clock = setInterval(() => (today = localToday()), 60_000);
    return () => clearInterval(clock);
  });
  const todayAt = $derived(today < horizon.from ? 0 : (onHorizon(today) ?? 100));
</script>

{#snippet err(id: string)}
  {#if errors[id]}
    <p class="field-error" id="{dom(id)}-err">
      {$t(errors[id].key, { path: errors[id].path, ...errors[id].params })}
    </p>
  {/if}
{/snippet}

{#snippet info()}
  <div class="info">
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" /></svg
    >
    <p>{$t('team.help')}</p>
  </div>
{/snippet}

{#snippet cross()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
{/snippet}

{#snippet plus()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}

<div class="stack team" bind:this={root}>
  {#if !team}
    <div class="card">
      <p class="empty">{$t('team.view.none')}</p>
      {@render info()}
    </div>
  {:else}
    {#key epoch}
      <div class="cols">
        <div class="col">
          <section class="card" aria-labelledby="{uid}-members-h">
            <h3 id="{uid}-members-h">{$t('team.members')}</h3>
            {@render info()}
            {#if grouped.length === 0}
              <p class="empty">{$t('team.members.empty')}</p>
            {:else}
              <ul class="members" aria-label={$t('team.members.caption', { team: team.name })}>
                {#each grouped as member (member.personId)}
                  {@const colour = roleColour(member.roleIds[0]!)}
                  {@const name = personName(member.personId)}
                  <li>
                    <span class="avatar" style:background={colour} style:color={inkOn(colour)}
                      >{initials(name)}</span
                    >
                    <span class="who">
                      <span class="name">{name}</span>
                      <span class="chips">
                        {#each member.roleIds as roleId (roleId)}
                          <span class="chip" style:--c={roleColour(roleId)}
                            >{roleName(roleId)}<button
                              type="button"
                              class="chip-remove"
                              aria-describedby={describe('member-remove')}
                              onclick={() => removeMember(member.personId, roleId)}
                              aria-label={$t('team.members.remove', {
                                person: name,
                                role: roleName(roleId),
                              })}>{@render cross()}</button
                            ></span
                          >
                        {/each}
                      </span>
                    </span>
                    <label class="hours">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={hoursOf(member.personId)}
                        aria-label={$t('team.members.hoursOf', { name, team: team.name })}
                        aria-invalid={errors[`hours-${member.personId}`] ? 'true' : undefined}
                        aria-describedby={describe(`hours-${member.personId}`)}
                        onchange={(e) => setHours(member.personId, e)}
                      />
                      <span aria-hidden="true">{$t('settings.people.unit')}</span>
                    </label>
                    {@render err(`hours-${member.personId}`)}
                  </li>
                {/each}
              </ul>
            {/if}
            {@render err('member-remove')}

            {#if roles.length === 0}
              <p class="empty">{$t('team.members.needs')}</p>
            {:else}
              <form class="row add-row" onsubmit={addMember}>
                <div class="field grow">
                  <label for="{uid}-add-person">{$t('team.members.person')}</label>
                  <input
                    id="{uid}-add-person"
                    data-member-add
                    list="{uid}-people"
                    autocomplete="off"
                    placeholder={$t('team.members.person.placeholder')}
                    bind:value={addName}
                    aria-invalid={errors['member-add'] ? 'true' : undefined}
                    aria-describedby={describe('member-add')}
                    oninput={() => clearError('member-add')}
                  />
                  <datalist id="{uid}-people">
                    {#each others as person (person.id)}
                      <option value={person.name}></option>
                    {/each}
                  </datalist>
                </div>
                <div class="field grow">
                  <label for="{uid}-add-role">{$t('team.members.role')}</label>
                  <select
                    id="{uid}-add-role"
                    value={roleChoice}
                    aria-invalid={errors['member-add'] ? 'true' : undefined}
                    aria-describedby={describe('member-add')}
                    onchange={(e) => {
                      addRole = e.currentTarget.value;
                      clearError('member-add');
                    }}
                  >
                    {#each roles as role (role.id)}
                      <option value={role.id}>{role.name}</option>
                    {/each}
                  </select>
                </div>
                <div class="field hours-field">
                  <label for="{uid}-add-hours">{$t('team.members.hours')}</label>
                  <input
                    id="{uid}-add-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder={String(defaultHours)}
                    value={addHours ?? ''}
                    oninput={(e) => {
                      const v = e.currentTarget.value;
                      addHours = v.trim() === '' ? null : Number(v);
                    }}
                  />
                </div>
                <button type="submit" class="secondary add"
                  >{@render plus()}{$t('team.members.add')}</button
                >
              </form>
              {@render err('member-add')}
            {/if}
          </section>

          <section class="card" aria-labelledby="{uid}-cadence-h">
            <h3 id="{uid}-cadence-h">{$t('team.cadence')}</h3>
            <p class="hint">{$t('team.cadence.hint')}</p>
            <div class="grid">
              <div class="field">
                <label for="{uid}-kind">{$t('team.cadence.kind')}</label>
                <select
                  id="{uid}-kind"
                  value={team.cadence.kind}
                  aria-invalid={errors['cadence-kind'] ? 'true' : undefined}
                  aria-describedby={describe('cadence-kind')}
                  onchange={(e) =>
                    setCadence('kind', $t('team.cadence.kind'), {
                      kind: e.currentTarget.value as Cadence['kind'],
                    })}
                >
                  {#each cadenceKinds as kind (kind)}
                    <option value={kind}>{$t('team.cadence.kind.' + kind)}</option>
                  {/each}
                </select>
                {@render err('cadence-kind')}
              </div>
              <div class="field">
                <label for="{uid}-length">{$t('team.cadence.length')}</label>
                <input
                  id="{uid}-length"
                  type="number"
                  min="1"
                  step="1"
                  value={team.cadence.lengthWeeks}
                  aria-invalid={errors['cadence-lengthWeeks'] ? 'true' : undefined}
                  aria-describedby={describe('cadence-lengthWeeks')}
                  onchange={onLength}
                />
                {@render err('cadence-lengthWeeks')}
              </div>
              <div class="field">
                <label for="{uid}-start">{$t('team.cadence.start')}</label>
                <input
                  id="{uid}-start"
                  type="date"
                  value={team.cadence.start}
                  aria-invalid={errors['cadence-start'] ? 'true' : undefined}
                  aria-describedby={describe('cadence-start')}
                  onchange={onStart}
                />
                {@render err('cadence-start')}
              </div>
            </div>
          </section>
        </div>

        <div class="col">
          <section class="card" aria-labelledby="{uid}-cycles-h">
            <h3 id="{uid}-cycles-h">{$t('team.cycles')}</h3>
            <p class="hint">{$t('team.cycles.hint')}</p>
            {#if team.cycles.length === 0}
              <p class="empty">{$t('team.cycles.empty')}</p>
            {:else}
              <ul class="cycles">
                {#each team.cycles as cycle (cycle.id)}
                  <li>
                    <div class="cycle-head">
                      <input
                        class="title"
                        type="text"
                        value={cycle.name}
                        aria-label={$t('team.cycle.rename', { name: cycle.name })}
                        aria-invalid={errors[`cycle-${cycle.id}`] ? 'true' : undefined}
                        aria-describedby={describe(`cycle-${cycle.id}`)}
                        onchange={(e) => renameCycle(cycle, e)}
                      />
                      <span class="count">
                        {$t(
                          cycle.milestones.length === 1
                            ? 'team.milestones.count.one'
                            : 'team.milestones.count.other',
                          { n: formatNumber($locale, cycle.milestones.length, 0) },
                        )}
                      </span>
                      <button
                        type="button"
                        class="icon-button"
                        aria-label={$t('team.cycle.delete', { name: cycle.name })}
                        aria-describedby={describe(`cycle-${cycle.id}`)}
                        onclick={() => deleteCycle(cycle)}>{@render cross()}</button
                      >
                    </div>
                    {@render err(`cycle-${cycle.id}`)}

                    {#if cycle.milestones.length > 0}
                      <!-- The milestones as points on the planning horizon; the fields below name them. -->
                      <div class="timeline" aria-hidden="true">
                        <span class="line"><span class="fill" style:width="{todayAt}%"></span></span
                        >
                        {#each cycle.milestones as ms (ms.id)}
                          {@const at = onHorizon(ms.date)}
                          {#if at !== null}<i class="point" style:left="{at}%"></i>{/if}
                        {/each}
                        <span class="ends">
                          <span>{formatDisplayDate($locale, horizon.from, 'short')}</span>
                          <span>{formatDisplayDate($locale, horizon.to, 'short')}</span>
                        </span>
                      </div>
                      <div class="heads" aria-hidden="true">
                        <span>{$t('team.milestone.name')}</span><span class="date-head"
                          >{$t('team.milestone.date')}</span
                        >
                      </div>
                    {/if}

                    <fieldset>
                      <legend class="sr-only">{$t('team.milestones', { cycle: cycle.name })}</legend
                      >
                      {#if cycle.milestones.length === 0}
                        <p class="empty">{$t('team.milestones.empty')}</p>
                      {/if}
                      {#each cycle.milestones as ms (ms.id)}
                        {@const mid = `ms-${cycle.id}-${ms.id}`}
                        <div class="row line-row">
                          <input
                            class="grow"
                            type="text"
                            value={ms.name}
                            aria-label={$t('team.milestone.rename', { name: ms.name })}
                            aria-invalid={errors[mid] ? 'true' : undefined}
                            aria-describedby={describe(mid)}
                            onchange={(e) => renameMilestone(cycle, ms.id, e)}
                          />
                          <input
                            type="date"
                            value={ms.date}
                            aria-label={$t('team.milestone.redate', { name: ms.name })}
                            aria-invalid={errors[mid] ? 'true' : undefined}
                            aria-describedby={describe(mid)}
                            onchange={(e) => redateMilestone(cycle, ms.id, e)}
                          />
                          <button
                            type="button"
                            class="icon-button"
                            aria-label={$t('team.milestone.delete', { name: ms.name })}
                            aria-describedby={describe(`ms-list-${cycle.id}`)}
                            onclick={() => removeMilestone(cycle, ms.id)}>{@render cross()}</button
                          >
                        </div>
                        {@render err(mid)}
                      {/each}
                      {@render err(`ms-list-${cycle.id}`)}

                      <form class="row add-row" onsubmit={(e) => addMilestone(cycle, e)}>
                        <div class="field grow">
                          <label for="{uid}-msn-{cycle.id}">{$t('team.milestone.new')}</label>
                          <input
                            id="{uid}-msn-{cycle.id}"
                            type="text"
                            data-ms-add={cycle.id}
                            value={draftOf(cycle.id).name}
                            aria-invalid={errors[`ms-add-${cycle.id}`] ? 'true' : undefined}
                            aria-describedby={describe(`ms-add-${cycle.id}`)}
                            oninput={(e) =>
                              (drafts[cycle.id] = {
                                ...draftOf(cycle.id),
                                name: e.currentTarget.value,
                              })}
                          />
                        </div>
                        <div class="field">
                          <label for="{uid}-msd-{cycle.id}">{$t('team.milestone.newDate')}</label>
                          <input
                            id="{uid}-msd-{cycle.id}"
                            type="date"
                            value={draftOf(cycle.id).date}
                            aria-invalid={errors[`ms-add-${cycle.id}`] ? 'true' : undefined}
                            aria-describedby={describe(`ms-add-${cycle.id}`)}
                            oninput={(e) =>
                              (drafts[cycle.id] = {
                                ...draftOf(cycle.id),
                                date: e.currentTarget.value,
                              })}
                          />
                        </div>
                        <button type="submit" class="secondary add"
                          >{@render plus()}{$t('team.milestone.add')}</button
                        >
                      </form>
                      {@render err(`ms-add-${cycle.id}`)}
                    </fieldset>
                  </li>
                {/each}
              </ul>
            {/if}

            <form class="row add-row" onsubmit={addCycle}>
              <div class="field grow">
                <label for="{uid}-cycle-new">{$t('team.cycles.new')}</label>
                <input
                  id="{uid}-cycle-new"
                  type="text"
                  data-cycle-add
                  bind:value={newCycle}
                  aria-invalid={errors['cycle-add'] ? 'true' : undefined}
                  aria-describedby={describe('cycle-add')}
                />
              </div>
              <button type="submit" class="secondary add"
                >{@render plus()}{$t('team.cycles.add')}</button
              >
            </form>
            {@render err('cycle-add')}
          </section>

          <section class="card" aria-labelledby="{uid}-assumptions-h">
            <h3 id="{uid}-assumptions-h">{$t('team.assumptions')}</h3>
            <p class="hint">{$t('team.assumptions.hint')}</p>
            {#if Object.keys(team.assumptions).length === 0}
              <p class="empty">{$t('team.assumptions.empty')}</p>
            {:else}
              <div class="heads" aria-hidden="true">
                <span>{$t('team.assumption.key')}</span><span class="value-head"
                  >{$t('team.assumption.value')}</span
                >
              </div>
              <ul class="assumptions">
                {#each Object.entries(team.assumptions) as [key, value] (key)}
                  <li>
                    <div class="row line-row">
                      <input
                        class="grow key"
                        type="text"
                        data-as-key={key}
                        value={key}
                        aria-label={$t('team.assumption.rename', { key })}
                        aria-invalid={errors[`as-${key}`] ? 'true' : undefined}
                        aria-describedby={describe(`as-${key}`)}
                        onchange={(e) => rekey(key, e)}
                      />
                      <input
                        class="value"
                        type="number"
                        step="any"
                        {value}
                        aria-label={$t('team.assumption.revalue', { key })}
                        aria-invalid={errors[`as-${key}`] ? 'true' : undefined}
                        aria-describedby={describe(`as-${key}`)}
                        onchange={(e) => revalue(key, e)}
                      />
                      <button
                        type="button"
                        class="icon-button"
                        aria-label={$t('team.assumption.delete', { key })}
                        aria-describedby={describe(`as-${key}`)}
                        onclick={() => removeAssumption(key)}>{@render cross()}</button
                      >
                    </div>
                    {@render err(`as-${key}`)}
                  </li>
                {/each}
              </ul>
            {/if}

            <form class="row add-row" onsubmit={addAssumption}>
              <div class="field grow">
                <label for="{uid}-as-new">{$t('team.assumption.new')}</label>
                <input
                  id="{uid}-as-new"
                  type="text"
                  data-as-add
                  bind:value={newKey}
                  aria-invalid={errors['as-add'] ? 'true' : undefined}
                  aria-describedby={describe('as-add')}
                />
              </div>
              <div class="field">
                <label for="{uid}-as-new-value">{$t('team.assumption.newValue')}</label>
                <input
                  id="{uid}-as-new-value"
                  class="value"
                  type="number"
                  step="any"
                  value={newValue}
                  oninput={(e) => (newValue = e.currentTarget.value)}
                  aria-invalid={errors['as-add'] ? 'true' : undefined}
                  aria-describedby={describe('as-add')}
                />
              </div>
              <button type="submit" class="secondary add"
                >{@render plus()}{$t('team.assumption.add')}</button
              >
            </form>
            {@render err('as-add')}
          </section>
        </div>
      </div>
    {/key}
    <!-- Outside the key block: the lists keep focus while they change the workspace. -->
    <section class="card shared" aria-labelledby="{uid}-shared-h">
      <h3 id="{uid}-shared-h">{$t('team.shared')}</h3>
      <p class="hint">{$t('team.shared.hint')}</p>
      <div class="lists">
        <ListEditor
          kind="people"
          items={$workspace.people}
          heading={$t('settings.people')}
          addLabel={$t('settings.people.add')}
          create={(name) => ({ name })}
          confirmRemove={confirmPerson}
        >
          {#snippet extra(person)}
            <span class="teams-of">{teamsOf(person.id)}</span>
          {/snippet}
        </ListEditor>
        <ListEditor
          kind="roles"
          items={$workspace.roles}
          heading={$t('settings.roles')}
          addLabel={$t('settings.roles.add')}
          create={(name) => ({
            name,
            colour: PALETTE[$workspace.roles.length % PALETTE.length]!.hex,
          })}
        >
          {#snippet extra(role, ctx)}
            <ColourField
              value={role.colour}
              label={$t('colour.of', { name: role.name })}
              onchange={(colour) => ctx.update({ colour })}
            />
          {/snippet}
        </ListEditor>
      </div>
    </section>
  {/if}
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }
  .card {
    min-width: 0;
  }
  h3 {
    margin: 0 0 0.35rem;
  }
  .hint,
  .empty {
    margin: 0 0 1rem;
    color: var(--text-muted);
  }
  .info {
    display: flex;
    gap: 0.6rem;
    margin: 0.5rem 0 1rem;
    padding: 0.75rem 0.9rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .info p {
    margin: 0;
  }
  .info svg {
    flex: none;
    width: 1.15rem;
    height: 1.15rem;
    margin-top: 0.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .members,
  .cycles,
  .assumptions {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .members li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }
  .name {
    font-weight: 650;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.05rem 0.2rem 0.05rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--c) 14%, transparent);
    color: var(--text);
  }
  :global(#app) .chip-remove {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
  }
  .chip-remove svg {
    width: 0.8rem;
    height: 0.8rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .hours {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .hours input {
    width: 4.5rem;
  }
  .hours-field {
    width: 9.5rem;
  }
  .teams-of {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .members li .field-error {
    flex-basis: 100%;
    margin: 0;
  }
  .shared {
    margin-top: var(--space, 1rem);
  }
  .lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 1.5rem;
    align-items: start;
  }
  .shared .hint {
    margin-top: 0;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.75rem;
  }
  .add-row {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--border-strong);
  }
  .line-row {
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .line-row input[type='date'] {
    width: 9.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .grow {
    flex: 1 1 10rem;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
  }
  .grid input,
  .grid select {
    width: 100%;
  }
  .value {
    width: 6.5rem;
  }
  :global(#app) .team .key {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .cycles > li {
    margin-bottom: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .cycle-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  :global(#app) .cycle-head .title {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 700;
    font-size: 1rem;
    border-color: var(--border);
    background: transparent;
  }
  :global(#app) .cycle-head .title:hover,
  :global(#app) .cycle-head .title:focus {
    border-color: var(--border-strong);
    background: var(--surface);
  }
  .count {
    flex: none;
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 650;
    white-space: nowrap;
    background: var(--ok-soft);
    color: var(--ok);
  }
  .timeline {
    position: relative;
    margin: 1rem 0.5rem 0.75rem;
  }
  .timeline .line {
    display: block;
    height: 0.25rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .timeline .fill {
    display: block;
    height: 100%;
    background: var(--brand-gradient);
  }
  .point {
    position: absolute;
    top: -0.3rem;
    width: 0.8rem;
    height: 0.8rem;
    translate: -50% 0;
    rotate: 45deg;
    border-radius: 0.2rem;
    background: var(--surface);
    border: 3px solid var(--ok);
    box-sizing: border-box;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 0.45rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .heads {
    display: flex;
    gap: 0.75rem;
    margin: 0.5rem 3.25rem 0.2rem 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .heads > :first-child {
    flex: 1;
  }
  .date-head {
    width: 9.5rem;
  }
  .value-head {
    width: 6.5rem;
  }
  :global(#app) .team fieldset {
    margin: 0.5rem 0 0;
    padding: 0;
    border: 0;
    min-width: 0;
    background: none;
  }
  @media (forced-colors: active) {
    .avatar,
    .count,
    .point {
      border: 1px solid CanvasText;
    }
    .timeline .fill {
      background: Highlight;
    }
    .timeline .line {
      border: 1px solid CanvasText;
    }
  }
</style>
