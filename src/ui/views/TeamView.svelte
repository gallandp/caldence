<script lang="ts">
  import { tick } from 'svelte';
  import { addItem, renameAssumption, updateTeam } from '../../core/edit';
  import { capacity } from '../../core/load';
  import { record } from '../../core/record';
  import ColourField, { PALETTE } from '../components/ColourField.svelte';
  import FieldError from '../components/FieldError.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import { locale, translate as t } from '../../i18n';
  import { initials, inkOn } from '../avatar';
  import { Problems } from '../state/problems.svelte';
  import { activeTeamId, workspace } from '../state/workspace';

  const uid = $props.id();

  const team = $derived($workspace.teams.find((x) => x.id === $activeTeamId));
  const personName = $derived(
    (id: string) => $workspace.people.find((p) => p.id === id)?.name ?? id,
  );
  const roleName = $derived((id: string) => $workspace.roles.find((r) => r.id === id)?.name ?? id);

  const problems = new Problems(uid);
  const { commit, fail, clear: clearError, describe } = problems;
  const errors = $derived(problems.errors);
  const epoch = $derived(problems.epoch);

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
  const hoursOf = (personId: string): number => capacity($workspace, personId, team?.id);

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
    // A blank field keeps the person's hours in this team, or leaves a new member on the
    // workspace default (no entry, so they follow it).
    const hours = addHours;
    if (hours !== null && (!Number.isFinite(hours) || hours < 0))
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
        memberHours: hours === null ? memberHours : withHours(memberHours, personId, hours),
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
      .map((x) => ({ name: x.name, h: capacity($workspace, personId, x.id) }));
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

  // ---------- presentation ----------

  /** A member's initials take the colour of the role. */
  const roleColour = (id: string) => roles.find((r) => r.id === id)?.colour ?? '#64748b';
</script>

{#snippet err(id: string)}
  <FieldError {problems} {id} />
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
    <!-- Members first, then the people and roles they are made of, then the assumptions. -->
    <div class="cards">
      {#key epoch}
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
      {/key}
      <!-- Outside the key blocks: the lists keep focus while they change the workspace. -->
      <div class="card">
        <ListEditor
          kind="people"
          items={$workspace.people}
          heading={$t('settings.people')}
          hint={$t('team.people.hint')}
          addLabel={$t('settings.people.add')}
          create={(name) => ({ name })}
          confirmRemove={confirmPerson}
        >
          {#snippet extra(person)}
            <span class="teams-of">{teamsOf(person.id)}</span>
          {/snippet}
        </ListEditor>
      </div>
      <div class="card">
        <ListEditor
          kind="roles"
          items={$workspace.roles}
          heading={$t('settings.roles')}
          hint={$t('team.roles.hint')}
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
      {#key epoch}
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
      {/key}
    </div>
  {/if}
</div>

<style>
  /* Cards flow in reading order: two per row on a wide screen, one below the other on a phone. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
    gap: 1.25rem;
    align-items: start;
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
  .members li :global(.field-error) {
    flex-basis: 100%;
    margin: 0;
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
  .value-head {
    width: 6.5rem;
  }
  @media (forced-colors: active) {
    .avatar {
      border: 1px solid CanvasText;
    }
  }
</style>
