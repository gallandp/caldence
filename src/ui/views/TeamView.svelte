<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { newId, removeCycle, renameAssumption, updateTeam, upsertCycle } from '../../core/edit';
  import type { Cadence, Cycle } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { activeTeamId, workspace, type Change } from '../state/workspace';

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
  let addPerson = $state('');
  let addRole = $state('');
  const personChoice = $derived(
    people.some((p) => p.id === addPerson) ? addPerson : (people[0]?.id ?? ''),
  );
  const roleChoice = $derived(roles.some((r) => r.id === addRole) ? addRole : (roles[0]?.id ?? ''));

  function addMember(event: Event) {
    event.preventDefault();
    if (!team || personChoice === '' || roleChoice === '') return;
    const { id, members } = team;
    if (members.some((m) => m.personId === personChoice && m.roleId === roleChoice))
      return fail('member-add', 'team.members.duplicate', '');
    commit('member-add', '', (ws) =>
      updateTeam(ws, id, { members: [...members, { personId: personChoice, roleId: roleChoice }] }),
    );
  }

  function removeMember(index: number) {
    if (!team) return;
    const { id, members } = team;
    clearError('member-add');
    const done = commit('member-remove', '', (ws) =>
      updateTeam(ws, id, { members: members.filter((_, i) => i !== index) }),
    );
    if (done) void focusSoon('[data-member-add]');
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
</script>

{#snippet err(id: string)}
  {#if errors[id]}
    <p class="field-error" id="{dom(id)}-err">
      {$t(errors[id].key, { path: errors[id].path, ...errors[id].params })}
    </p>
  {/if}
{/snippet}

<div class="team" bind:this={root}>
  <p class="help">{$t('team.help')}</p>

  {#if !team}
    <p class="empty">{$t('team.view.none')}</p>
  {:else}
    {#key epoch}
      <section aria-labelledby="{uid}-members-h">
        <h3 id="{uid}-members-h">{$t('team.members')}</h3>
        {#if team.members.length === 0}
          <p class="empty">{$t('team.members.empty')}</p>
        {:else}
          <div class="table-wrap">
            <table>
              <caption>{$t('team.members.caption', { team: team.name })}</caption>
              <thead>
                <tr>
                  <th scope="col">{$t('team.members.person')}</th>
                  <th scope="col">{$t('team.members.role')}</th>
                  <th scope="col">{$t('team.members.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {#each team.members as member, i (JSON.stringify([member.personId, member.roleId]))}
                  <tr>
                    <td>{personName(member.personId)}</td>
                    <td>{roleName(member.roleId)}</td>
                    <td>
                      <button
                        type="button"
                        aria-describedby={describe('member-remove')}
                        onclick={() => removeMember(i)}
                        aria-label={$t('team.members.remove', {
                          person: personName(member.personId),
                          role: roleName(member.roleId),
                        })}><span aria-hidden="true">✕</span></button
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {@render err('member-remove')}

        {#if people.length === 0 || roles.length === 0}
          <p class="empty">{$t('team.members.needs')}</p>
        {:else}
          <form class="row" onsubmit={addMember}>
            <div class="field">
              <label for="{uid}-add-person">{$t('team.members.person')}</label>
              <select
                id="{uid}-add-person"
                data-member-add
                value={personChoice}
                aria-invalid={errors['member-add'] ? 'true' : undefined}
                aria-describedby={describe('member-add')}
                onchange={(e) => {
                  addPerson = e.currentTarget.value;
                  clearError('member-add');
                }}
              >
                {#each people as person (person.id)}
                  <option value={person.id}>{person.name}</option>
                {/each}
              </select>
            </div>
            <div class="field">
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
            <button type="submit" class="primary">{$t('team.members.add')}</button>
          </form>
          {@render err('member-add')}
        {/if}
      </section>

      <section aria-labelledby="{uid}-cadence-h">
        <h3 id="{uid}-cadence-h">{$t('team.cadence')}</h3>
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

      <section aria-labelledby="{uid}-cycles-h">
        <h3 id="{uid}-cycles-h">{$t('team.cycles')}</h3>
        {#if team.cycles.length === 0}
          <p class="empty">{$t('team.cycles.empty')}</p>
        {:else}
          <ul class="items">
            {#each team.cycles as cycle (cycle.id)}
              <li>
                <div class="row">
                  <div class="field grow">
                    <label for="{uid}-cy-{cycle.id}">{$t('team.cycle.name')}</label>
                    <input
                      id="{uid}-cy-{cycle.id}"
                      type="text"
                      value={cycle.name}
                      aria-label={$t('team.cycle.rename', { name: cycle.name })}
                      aria-invalid={errors[`cycle-${cycle.id}`] ? 'true' : undefined}
                      aria-describedby={describe(`cycle-${cycle.id}`)}
                      onchange={(e) => renameCycle(cycle, e)}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={$t('team.cycle.delete', { name: cycle.name })}
                    aria-describedby={describe(`cycle-${cycle.id}`)}
                    onclick={() => deleteCycle(cycle)}><span aria-hidden="true">✕</span></button
                  >
                </div>
                {@render err(`cycle-${cycle.id}`)}

                <fieldset>
                  <legend>{$t('team.milestones', { cycle: cycle.name })}</legend>
                  {#if cycle.milestones.length === 0}
                    <p class="empty">{$t('team.milestones.empty')}</p>
                  {/if}
                  {#each cycle.milestones as ms (ms.id)}
                    {@const mid = `ms-${cycle.id}-${ms.id}`}
                    <div class="row">
                      <div class="field grow">
                        <label for="{dom(mid)}-name">{$t('team.milestone.name')}</label>
                        <input
                          id="{dom(mid)}-name"
                          type="text"
                          value={ms.name}
                          aria-label={$t('team.milestone.rename', { name: ms.name })}
                          aria-invalid={errors[mid] ? 'true' : undefined}
                          aria-describedby={describe(mid)}
                          onchange={(e) => renameMilestone(cycle, ms.id, e)}
                        />
                      </div>
                      <div class="field">
                        <label for="{dom(mid)}-date">{$t('team.milestone.date')}</label>
                        <input
                          id="{dom(mid)}-date"
                          type="date"
                          value={ms.date}
                          aria-label={$t('team.milestone.redate', { name: ms.name })}
                          aria-invalid={errors[mid] ? 'true' : undefined}
                          aria-describedby={describe(mid)}
                          onchange={(e) => redateMilestone(cycle, ms.id, e)}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={$t('team.milestone.delete', { name: ms.name })}
                        aria-describedby={describe(`ms-list-${cycle.id}`)}
                        onclick={() => removeMilestone(cycle, ms.id)}
                        ><span aria-hidden="true">✕</span></button
                      >
                    </div>
                    {@render err(mid)}
                  {/each}
                  {@render err(`ms-list-${cycle.id}`)}

                  <form class="row" onsubmit={(e) => addMilestone(cycle, e)}>
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
                    <button type="submit" class="primary">{$t('team.milestone.add')}</button>
                  </form>
                  {@render err(`ms-add-${cycle.id}`)}
                </fieldset>
              </li>
            {/each}
          </ul>
        {/if}

        <form class="row" onsubmit={addCycle}>
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
          <button type="submit" class="primary">{$t('team.cycles.add')}</button>
        </form>
        {@render err('cycle-add')}
      </section>

      <section aria-labelledby="{uid}-assumptions-h">
        <h3 id="{uid}-assumptions-h">{$t('team.assumptions')}</h3>
        {#if Object.keys(team.assumptions).length === 0}
          <p class="empty">{$t('team.assumptions.empty')}</p>
        {:else}
          <ul class="items">
            {#each Object.entries(team.assumptions) as [key, value] (key)}
              <li>
                <div class="row">
                  <div class="field grow">
                    <label for="{dom('as-' + key)}-key">{$t('team.assumption.key')}</label>
                    <input
                      id="{dom('as-' + key)}-key"
                      type="text"
                      data-as-key={key}
                      value={key}
                      aria-label={$t('team.assumption.rename', { key })}
                      aria-invalid={errors[`as-${key}`] ? 'true' : undefined}
                      aria-describedby={describe(`as-${key}`)}
                      onchange={(e) => rekey(key, e)}
                    />
                  </div>
                  <div class="field">
                    <label for="{dom('as-' + key)}-value">{$t('team.assumption.value')}</label>
                    <input
                      id="{dom('as-' + key)}-value"
                      type="number"
                      step="any"
                      {value}
                      aria-label={$t('team.assumption.revalue', { key })}
                      aria-invalid={errors[`as-${key}`] ? 'true' : undefined}
                      aria-describedby={describe(`as-${key}`)}
                      onchange={(e) => revalue(key, e)}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={$t('team.assumption.delete', { key })}
                    aria-describedby={describe(`as-${key}`)}
                    onclick={() => removeAssumption(key)}><span aria-hidden="true">✕</span></button
                  >
                </div>
                {@render err(`as-${key}`)}
              </li>
            {/each}
          </ul>
        {/if}

        <form class="row" onsubmit={addAssumption}>
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
              type="number"
              step="any"
              value={newValue}
              oninput={(e) => (newValue = e.currentTarget.value)}
              aria-invalid={errors['as-add'] ? 'true' : undefined}
              aria-describedby={describe('as-add')}
            />
          </div>
          <button type="submit" class="primary">{$t('team.assumption.add')}</button>
        </form>
        {@render err('as-add')}
      </section>
    {/key}
  {/if}
</div>

<style>
  .team {
    max-width: 48rem;
  }
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space);
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
  .items {
    list-style: none;
    margin: 0 0 var(--space);
    padding: 0;
  }
  .items > li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0.5rem 0;
    padding: 0.5rem var(--space) var(--space);
    min-width: 0;
  }
  legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.75rem 0.4rem 0;
    border-bottom: 1px solid var(--border);
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
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
