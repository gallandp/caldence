<script lang="ts">
  import { weeklyLimit } from '../../core/line';
  import { tick } from 'svelte';
  import { removeFromArea, setAreaHours, setAreaRole } from '../../core/areaEdit';
  import { roleByName, updateTeam } from '../../core/edit';
  import { LIMITS } from '../../core/limits';
  import { capacity, overbooked } from '../../core/load';
  import { attendees, eventAttendees, holders, type Area } from '../../core/model';
  import { record } from '../../core/record';
  import type { StructurePerson } from '../../core/structure';
  import { locale, translate as t } from '../../i18n';
  import AreaIcon from './AreaIcon.svelte';
  import { PALETTE } from './ColourField.svelte';
  import FieldError from './FieldError.svelte';
  import { Problems } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';
  import { presenting } from '../state/present';

  /**
   * The card of one person in the structure view: hours per area and team, editable area role and
   * hours. A non-modal dialog, so the tree stays visible with the person highlighted.
   */
  let {
    area,
    personId,
    person: p,
    onclose,
    ongone,
  }: {
    area: Area;
    personId: string | null;
    /** The person's place in the structure; undefined once they left it. */
    person: StructurePerson | undefined;
    onclose: () => void;
    /** The person left the structure (removed from an area they only worked in). */
    ongone: () => void;
  } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, clear, describe } = problems;
  const errors = $derived(problems.errors);

  let dialog: HTMLDialogElement | undefined = $state();
  let trigger: HTMLElement | null = null;

  const name = $derived($workspace.people.find((x) => x.id === personId)?.name ?? '');
  const roles = $derived($workspace.roles);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const teamName = (id: string) => $workspace.teams.find((x) => x.id === id)?.name ?? id;
  const num = (n: number) => new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n);
  const meetings = $derived(
    personId
      ? area.events.filter((e) => eventAttendees($workspace, area.id, e).includes(personId))
      : [],
  );
  /** The "from every team" invitation that brought them into the area without hours. */
  const invite = $derived.by(() => {
    if (!p?.invitedOnly) return '';
    // Through its own role or a team role linked to it (#338).
    const hit = area.events
      .flatMap((e) => e.participants)
      .find((x) => x.fromTeams && holders($workspace, area.id, x).includes(p.personId));
    return hit?.roleId !== undefined ? $t('area.fromTeams', { role: roleName(hit.roleId) }) : '';
  });

  // The person is gone from the structure: close, and let the view move the focus.
  $effect(() => {
    if (personId && !p && dialog?.open) {
      dialog.close();
      onclose();
      ongone();
    }
  });
  $effect(() => {
    if (!personId && dialog?.open) dialog.close();
  });

  /** Opens the card for the selected person; focus goes to the area hours or the heading. */
  export async function open(from: HTMLElement, focusHours = false) {
    trigger = from;
    await tick();
    if (!dialog) return;
    if (!dialog.open) dialog.show();
    const target = focusHours
      ? dialog.querySelector<HTMLElement>('[data-area-hours]')
      : dialog.querySelector<HTMLElement>('h2');
    target?.focus();
  }

  function close() {
    const id = personId;
    dialog?.close();
    onclose();
    // An edit may have moved the person to another group, which replaced the tile that opened
    // the card: focus their tile where it is now.
    if (trigger?.isConnected) return trigger.focus();
    const tile =
      id === null
        ? null
        : document.querySelector<HTMLElement>(
            `.structure .team [data-p="${CSS.escape(id)}"], .structure [data-p="${CSS.escape(id)}"]`,
          );
    if (tile) tile.focus();
    else ongone();
  }

  /** Escape closes the card, also while focus is back in the tree (the card is not modal). */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !dialog?.open || document.querySelector('dialog:modal')) return;
    event.preventDefault();
    close();
  }

  /** The meeting's name, and the invitation behind it when that is the only way in. */
  function meetingLine(e: (typeof area.events)[number]): string {
    if (!personId) return e.name;
    const own = new Set(area.members.filter((m) => m.personId === personId).map((m) => m.roleId));
    const direct = e.participants.some(
      (x) => (x.roleId !== undefined && own.has(x.roleId)) || x.personId === personId,
    );
    const via = e.participants.find(
      (x) => x.fromTeams && attendees($workspace, area.id, x, e).includes(personId),
    );
    return direct || via?.roleId === undefined
      ? e.name
      : $t('area.card.via', {
          meeting: e.name,
          invite: $t('area.fromTeams', { role: roleName(via.roleId) }),
        });
  }
  const mainRole = $derived(p ? roleName(p.teams[0]?.roleIds[0] ?? p.areaRoleIds[0] ?? '') : '');

  function parse(input: HTMLInputElement, id: string, label: string): number | null {
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(n) || n < 0) {
      fail(id, 'error.number.invalid', label);
      return null;
    }
    return n;
  }

  function onAreaHours(event: Event) {
    if (!personId) return;
    const label = $t('area.card.hoursIn', { name, unit: area.name });
    const n = parse(event.currentTarget as HTMLInputElement, 'area-hours', label);
    if (n === null) return;
    const id = personId;
    commit('area-hours', label, (ws) => setAreaHours(ws, area.id, id, n));
  }

  function onTeamHours(teamId: string, event: Event) {
    if (!personId) return;
    const team = $workspace.teams.find((x) => x.id === teamId);
    if (!team) return;
    const label = $t('area.card.hoursIn', { name, unit: team.name });
    const n = parse(event.currentTarget as HTMLInputElement, `team-${teamId}`, label);
    if (n === null) return;
    const id = personId;
    const hours = Object.assign(record<number>(), team.memberHours, { [id]: n });
    commit(`team-${teamId}`, label, (ws) => updateTeam(ws, teamId, { memberHours: hours }));
  }

  /** The select's value for "New role …", which asks for the new role's name below it. */
  const NEW = ':new';
  let creating = $state(false);
  $effect(() => {
    void personId;
    creating = false;
  });

  async function onRole(event: Event) {
    if (!personId) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === NEW) {
      creating = true;
      clear('area-role');
      await tick();
      dialog?.querySelector<HTMLInputElement>('[data-new-role]')?.focus();
      return;
    }
    creating = false;
    const id = personId;
    commit('area-role', $t('area.card.role'), (ws) =>
      setAreaRole(ws, area.id, id, value === '' ? null : value),
    );
  }

  /** Creates the role (or takes the one with that name) and makes it the person's area role. */
  function onNewRole(event: Event) {
    if (!personId) return;
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    if (value === '') return fail('area-role', 'error.required', $t('settings.roles.add'));
    if (value.length > LIMITS.textChars)
      return fail('area-role', 'error.text.tooLong', $t('settings.roles.add'));
    const id = personId;
    const colour = PALETTE[roles.length % PALETTE.length]!.hex;
    const done = commit('area-role', $t('area.card.role'), (ws) => {
      const [next, roleId] = roleByName(ws, value, colour);
      return setAreaRole(next, area.id, id, roleId);
    });
    if (done) {
      creating = false;
      void tick().then(() => dialog?.querySelector<HTMLElement>('[data-area-role]')?.focus());
    }
  }

  function onNewRoleKeydown(event: KeyboardEvent) {
    // Enter and leaving save (change), which does not fire for a field left empty.
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter' && input.value.trim() === '')
      return fail('area-role', 'error.required', $t('settings.roles.add'));
    // Escape cancels the new role only; the card stays open.
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    creating = false;
    clear('area-role');
    void tick().then(() => dialog?.querySelector<HTMLElement>('[data-area-role]')?.focus());
  }

  function remove() {
    if (!personId) return;
    const id = personId;
    if (commit('remove', '', (ws) => removeFromArea(ws, area.id, id)))
      void tick().then(() => dialog?.querySelector<HTMLElement>('h2')?.focus());
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<dialog bind:this={dialog} class="card" aria-labelledby="{uid}-name">
  {#if p}
    <header>
      <div>
        <h2 id="{uid}-name" tabindex="-1">{name}</h2>
        <small>{mainRole}</small>
      </div>
      <button type="button" class="icon-button x" onclick={close}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg><span
          class="sr-only">{$t('area.card.close')}</span
        ></button
      >
    </header>

    <h3 class="section">{$t('area.card.hours')}</h3>
    <div class="row">
      <div class="place">
        <span class="unit-name area"><AreaIcon />{area.name}</span>
        {#if p.areaRoleIds.length > 1}
          <!-- Several roles at area level: shown, not edited here, so none gets lost. -->
          <small>{p.areaRoleIds.map(roleName).join(', ')}</small>
        {:else if $presenting}
          <!-- Presenting: the card shows, it does not edit. -->
          <small>{p.areaRoleIds[0] ? roleName(p.areaRoleIds[0]) : $t('area.card.noRole')}</small>
        {:else}
          <select
            data-area-role
            value={creating ? NEW : (p.areaRoleIds[0] ?? '')}
            aria-label={$t('area.card.role')}
            aria-invalid={!creating && errors['area-role'] ? true : undefined}
            aria-describedby={creating ? undefined : describe('area-role')}
            onchange={onRole}
          >
            <option value=""
              >{invite
                ? $t('area.card.noRoleImplicit', { invite })
                : $t('area.card.noRole')}</option
            >
            {#each roles as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            <option value={NEW}>{$t('area.role.new')}</option>
          </select>
          {#if creating}
            <input
              type="text"
              data-new-role
              placeholder={$t('area.role.placeholder')}
              aria-label={$t('settings.roles.add')}
              aria-invalid={errors['area-role'] ? true : undefined}
              aria-describedby={describe('area-role')}
              onchange={onNewRole}
              onkeydown={onNewRoleKeydown}
            />
          {/if}
        {/if}
      </div>
      <span class="hours">
        {#if $presenting}{num(p.areaHours)}{:else}<input
            type="number"
            min="0"
            step="0.5"
            data-area-hours
            class:unset={p.invitedOnly}
            value={p.areaHours}
            aria-label={$t('area.card.hoursArea')}
            aria-invalid={errors['area-hours'] ? true : undefined}
            aria-describedby={describe('area-hours')}
            onchange={onAreaHours}
          />{/if}{$t('area.card.unit')}
      </span>
    </div>
    <FieldError {problems} id="area-role" />
    <FieldError {problems} id="area-hours" />
    {#each p.teams as x (x.teamId)}
      <div class="row">
        <div class="place">
          <span class="unit-name">{teamName(x.teamId)}</span>
          <small>{x.roleIds.map(roleName).join(', ')}</small>
        </div>
        <span class="hours">
          {#if $presenting}{num(x.hours)}{:else}<input
              type="number"
              min="0"
              step="0.5"
              value={x.hours}
              aria-label={$t('area.card.hoursTeam', { team: teamName(x.teamId) })}
              aria-invalid={errors[`team-${x.teamId}`] ? true : undefined}
              aria-describedby={describe(`team-${x.teamId}`)}
              onchange={(e) => onTeamHours(x.teamId, e)}
            />{/if}{$t('area.card.unit')}
        </span>
      </div>
      <FieldError {problems} id="team-{x.teamId}" />
    {/each}
    {#if p.otherHours > 0}
      <div class="row other">
        <span>{$t('area.structure.otherTeams')}</span><span
          >{num(p.otherHours)} {$t('area.card.unit')}</span
        >
      </div>
    {/if}
    <div class="row sum">
      <span>{$t('area.card.total')}</span><span>{num(p.total)} {$t('area.card.unit')}</span>
    </div>
    {#if personId && overbooked($workspace, personId)}
      <p class="over" data-over>
        {$t('team.people.over', {
          hours: num(capacity($workspace, personId)),
          max: num(weeklyLimit($workspace, personId)),
        })}
      </p>
    {/if}

    {#if meetings.length > 0}
      <p class="hint">
        {$t('area.card.meetings', { list: meetings.map(meetingLine).join(', ') })}
      </p>
    {/if}

    <div class="foot" data-no-present>
      {#if p.areaRoleIds.length > 0 || p.areaHours > 0}
        <button type="button" class="remove" onclick={remove}
          >{$t('area.card.remove', { name: area.name })}</button
        >
      {:else if invite}
        <button type="button" class="remove" disabled aria-describedby="{uid}-implicit"
          >{$t('area.card.remove', { name: area.name })}</button
        >
        <p class="hint" id="{uid}-implicit">{$t('area.person.implicit', { invite })}</p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .card {
    box-sizing: border-box;
    position: fixed;
    inset: auto 1.25rem 1.25rem auto;
    z-index: 20;
    width: min(23.75rem, calc(100vw - 1rem));
    max-height: calc(100vh - 2.5rem);
    margin: 0;
    padding: 1rem 1.125rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    color: var(--text);
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    margin-bottom: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  header small {
    color: var(--text-muted);
  }
  :global(#app) .x {
    width: 2.5rem;
    height: 2.5rem;
    margin-left: auto;
    border-color: var(--border);
  }
  .x svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  :global(#app) .section {
    margin: 0 0 0.375rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }
  .place {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .place small {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .unit-name {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--accent-text);
    font-weight: 600;
  }
  .unit-name.area {
    color: var(--area);
  }
  .hours {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  :global(#app) .hours input {
    width: 100%;
    text-align: right;
  }
  :global(#app) .hours input.unset {
    border-color: var(--warn);
    background: var(--warn-soft);
  }
  .other {
    color: var(--text-muted);
  }
  .other span:last-child,
  .sum span:last-child {
    padding-right: 0.9rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .sum {
    border-top: 2px solid var(--border);
    border-bottom: 0;
    font-weight: 700;
  }
  .over {
    margin: 0.25rem 0 0;
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
    font-weight: 600;
  }
  .hint {
    margin: 0.375rem 0 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .foot {
    margin-top: 0.75rem;
  }
  :global(#app) .remove {
    padding: 0.3rem 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--danger);
  }
  :global(#app) .remove:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }
  @media (max-width: 820px) {
    .card {
      inset: auto 0 0 0;
      width: 100vw;
      max-width: none;
      max-height: 85vh;
      border-radius: 1rem 1rem 0 0;
      /* viewport-fit=cover: keep clear of the notch and the home indicator. */
      padding-left: max(1.125rem, env(safe-area-inset-left, 0px));
      padding-right: max(1.125rem, env(safe-area-inset-right, 0px));
      padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
    }
  }
</style>
