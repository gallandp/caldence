<script lang="ts">
  import {
    addDemand,
    defaultDemandRole,
    demandRows,
    minCommitment,
    productMeetings,
    skillChoices,
    updateDemand,
  } from '../../core/demand';
  import { removeDemand } from '../../core/line';
  import type { Demand, Team } from '../../core/model';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { tick, untrack } from 'svelte';
  import { Problems } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';
  import ConfirmDialog, { type Choice } from './ConfirmDialog.svelte';
  import FieldError from './FieldError.svelte';
  import AssignDialog from './AssignDialog.svelte';
  import ImpactTag from './ImpactTag.svelte';
  import { presenting } from '../state/present';

  /**
   * A product's demand (#318): skills (or roles) with FTE, what the line has committed and who,
   * the Mindestzusage of the role and the meetings behind it ("Termine pro Person").
   */
  let { team }: { team: Team } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, clear, describe, invalid } = problems;
  const epoch = $derived(problems.epoch);

  const ws = $derived($workspace);
  const rows = $derived(demandRows(ws, team));
  const choices = $derived(skillChoices(ws, team.id));
  const area = $derived(ws.areas.find((a) => a.teamIds.includes(team.id)));
  const ownFamily = $derived(ws.skillFamilies?.find((f) => f.id === area?.skillFamilyId));
  const defaultRole = $derived(defaultDemandRole(ws, team));
  const roleName = (id: string) => ws.roles.find((r) => r.id === id)?.name ?? id;
  const skillName = (id: string) => ws.skills?.find((s) => s.id === id)?.name ?? id;
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const fte = (n: number) => formatNumber($locale, n, 1);
  const hours = (n: number) =>
    new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n);
  const label = (d: Demand) => (d.skillId ? skillName(d.skillId) : roleName(d.roleId));

  const total = $derived(rows.reduce((s, r) => s + r.demand.fte, 0));
  const committed = $derived(rows.reduce((s, r) => s + r.committed, 0));

  /** At least 0.1 FTE: less shows as "0,0 FTE". */
  const validFte = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0.1;

  let root: HTMLElement | undefined = $state();
  async function focusSoon(selector: string) {
    await tick();
    root?.querySelector<HTMLElement>(selector)?.focus();
  }

  // ---------- the add form ----------

  /** '' is "without a skill, only a role". */
  let addSkill = $state<string | null>(null);
  let addFte = $state<number | null>(null);
  let addRole = $state('');
  // A skill removed meanwhile (undo, another view) falls back to the first one.
  const skillChoice = $derived(
    addSkill !== null && (addSkill === '' || ws.skills?.some((s) => s.id === addSkill))
      ? addSkill
      : (choices.own[0]?.id ?? choices.other[0]?.id ?? ''),
  );
  const roleOnly = $derived(skillChoice === '');
  const roleChoice = $derived(
    roleOnly && ws.roles.some((r) => r.id === addRole) ? addRole : (defaultRole ?? ''),
  );

  function add(event: Event) {
    event.preventDefault();
    if (roleChoice === '') return fail('add', 'error.required', $t('demand.role'));
    if (!validFte(addFte)) return fail('add', 'error.number.invalid', $t('demand.fte'));
    const data: Omit<Demand, 'id'> = { fte: addFte, roleId: roleChoice };
    if (!roleOnly) data.skillId = skillChoice;
    const done = commit('add', $t('demand.fte'), (w) => {
      const r = addDemand(w, team.id, data);
      return r.ok ? { ok: true, value: r.value[0] } : r;
    });
    if (done) addFte = null;
  }

  // ---------- editing a row ----------

  let editing = $state<{ id: string; skillId: string; fte: number | null; roleId: string } | null>(
    null,
  );
  function edit(d: Demand) {
    clear('edit');
    editing = { id: d.id, skillId: d.skillId ?? '', fte: d.fte, roleId: d.roleId };
    void focusSoon(`#${CSS.escape(uid)}-e-skill`);
  }
  function save(event: Event) {
    event.preventDefault();
    const e = editing;
    if (!e) return;
    const n = e.fte;
    if (!validFte(n)) return fail('edit', 'error.number.invalid', $t('demand.fte'));
    const done = commit('edit', $t('demand.role'), (w) =>
      updateDemand(w, team.id, e.id, {
        fte: n,
        roleId: e.roleId,
        skillId: e.skillId === '' ? undefined : e.skillId,
      }),
    );
    if (done) stopEditing();
  }
  function stopEditing() {
    const id = editing?.id;
    editing = null;
    clear('edit');
    if (id) void focusSoon(`[data-demand="${CSS.escape(id)}"] [data-edit]`);
  }

  /** A staffed demand is deleted only after a yes: its people leave the product. */
  let deleting = $state<{ demand: Demand; people: number } | null>(null);
  function askDelete(d: Demand, people: number) {
    if (people > 0) deleting = { demand: d, people };
    else remove(d.id);
  }
  function onDeleteChoice(choice: Choice) {
    const pending = deleting;
    deleting = null;
    if (choice === 'save' && pending) remove(pending.demand.id);
  }
  function remove(id: string) {
    if (commit('row', '', (w) => ({ ok: true, value: removeDemand(w, team.id, id) })))
      void focusSoon(`#${CSS.escape(uid)}-skill`);
  }

  // Another team, undo or a change elsewhere: drafts and an open row editor start afresh (demand
  // ids repeat across teams).
  $effect(() => {
    void problems.epoch;
    untrack(() => {
      editing = null;
      deleting = null;
      addSkill = null;
      addRole = '';
      addFte = null;
    });
  });

  // ---------- Mindestzusage and the meetings behind it ----------

  /** The role in focus: the one the add form would staff. */
  const focusRole = $derived(roleChoice);
  const min = $derived(focusRole ? minCommitment(ws, team, focusRole) : undefined);
  const meetings = $derived(focusRole ? productMeetings(ws, team, focusRole) : []);
  const unitName = (id: string) =>
    id === team.id ? '' : (ws.areas.find((a) => a.id === id)?.name ?? '');
  const meetingSum = $derived(meetings.reduce((s, m) => s + m.hours, 0));
  const maxShare = $derived(formatPercent($locale, ws.settings.thresholds.maxFte));

  let whyOpen = $state(false);

  // ---------- staffing a person on a demand (#320) ----------

  let staffing = $state<Demand | null>(null);
  function closeStaffing() {
    const id = staffing?.id;
    staffing = null;
    if (id) void focusSoon(`[data-demand="${CSS.escape(id)}"] [data-assign]`);
  }
</script>

{#snippet skillOptions(selected: string)}
  {#if choices.own.length > 0}
    <optgroup label={$t('demand.skills.own', { family: ownFamily?.name ?? '' })}>
      {#each choices.own as s (s.id)}
        <option value={s.id} selected={s.id === selected}>{s.name}</option>
      {/each}
    </optgroup>
    {#if choices.other.length > 0}
      <optgroup label={$t('demand.skills.other')}>
        {#each choices.other as s (s.id)}
          <option value={s.id} selected={s.id === selected}>{s.name}</option>
        {/each}
      </optgroup>
    {/if}
  {:else}
    {#each choices.other as s (s.id)}
      <option value={s.id} selected={s.id === selected}>{s.name}</option>
    {/each}
  {/if}
  <option value="" selected={selected === ''}>{$t('demand.skill.none')}</option>
{/snippet}

{#snippet roleOptions(selected: string)}
  {#each ws.roles as r (r.id)}
    <option value={r.id} selected={r.id === selected}>{r.name}</option>
  {/each}
{/snippet}

<section class="card demand" aria-labelledby="{uid}-h" data-demand-card bind:this={root}>
  <div class="head">
    <h3 id="{uid}-h">{$t('demand.heading')}</h3>
    {#if rows.length > 0}
      <p class="sum" data-demand-sum>
        {$t('demand.summary', { committed: fte(committed), total: fte(total) })}
      </p>
    {/if}
  </div>

  {#key epoch}
    {#if rows.length === 0}
      <p class="empty">{$t('demand.empty', { team: team.name })}</p>
    {:else}
      <div class="heads" aria-hidden="true">
        <span>{$t('demand.col.skill')}</span><span class="num">{$t('demand.col.fte')}</span><span
          class="num">{$t('demand.col.committed')}</span
        ><span>{$t('demand.col.who')}</span>
      </div>
      <ul class="rows" aria-label={$t('demand.caption', { team: team.name })}>
        {#each rows as row (row.demand.id)}
          {@const d = row.demand}
          {@const name = label(d)}
          <li data-demand={d.id}>
            {#if editing?.id === d.id}
              <form class="row edit" onsubmit={save} data-no-present>
                <div class="field grow">
                  <label for="{uid}-e-skill">{$t('demand.skill')}</label>
                  <select
                    id="{uid}-e-skill"
                    onchange={(e) => (editing!.skillId = e.currentTarget.value)}
                  >
                    {@render skillOptions(editing.skillId)}
                  </select>
                </div>
                <div class="field fte-field">
                  <label for="{uid}-e-fte">{$t('demand.fte')}</label>
                  <input
                    id="{uid}-e-fte"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editing.fte ?? ''}
                    aria-invalid={invalid('edit')}
                    aria-describedby={describe('edit')}
                    oninput={(e) => {
                      const v = e.currentTarget.value;
                      editing!.fte = v.trim() === '' ? null : Number(v);
                    }}
                  />
                </div>
                <div class="field grow">
                  <label for="{uid}-e-role">{$t('demand.role')}</label>
                  <select
                    id="{uid}-e-role"
                    onchange={(e) => (editing!.roleId = e.currentTarget.value)}
                  >
                    {@render roleOptions(editing.roleId)}
                  </select>
                </div>
                <div class="actions">
                  <button type="button" onclick={stopEditing}>{$t('dialog.cancel')}</button>
                  <button type="submit" class="primary">{$t('demand.save')}</button>
                </div>
                <FieldError {problems} id="edit" />
              </form>
            {:else}
              <span class="what">
                {#if d.skillId}
                  <span class="skill">{name}</span>
                {:else}
                  <span class="skill role-only">{name}</span>
                  <small>{$t('demand.roleOnly')}</small>
                {/if}
                {#if d.skillId && d.roleId !== defaultRole}
                  <small>{$t('demand.asRole', { role: roleName(d.roleId) })}</small>
                {/if}
              </span>
              <span class="nums">
                <span class="num fte"
                  ><span class="sr-only">{$t('demand.col.fte')}: </span>{$t('demand.fteValue', {
                    n: fte(d.fte),
                  })}</span
                >
                <span class="num com" class:short={row.committed < d.fte}
                  ><span class="sr-only">{$t('demand.col.committed')}: </span>{$t(
                    'demand.fteValue',
                    {
                      n: fte(row.committed),
                    },
                  )}</span
                >
              </span>
              <span class="who">
                <span class="sr-only">{$t('demand.col.who')}: </span>
                {#if row.who.length === 0}
                  <span class="nobody">{$t('demand.nobody')}</span>
                {:else}
                  <ul class="people">
                    {#each row.who as w (w.personId)}
                      <li data-who={w.personId}>
                        {$t('demand.person', { name: personName(w.personId), n: fte(w.fte) })}
                        <ImpactTag
                          {ws}
                          teamId={team.id}
                          personId={w.personId}
                          roleId={d.roleId}
                          short
                        />
                      </li>
                    {/each}
                  </ul>
                {/if}
                <button
                  type="button"
                  class="staff"
                  data-assign
                  data-no-present
                  aria-label={$t('assign.startFor', { name })}
                  onclick={() => (staffing = d)}>{$t('assign.start')}</button
                >
              </span>
              <span class="tools" data-no-present>
                <button
                  type="button"
                  class="icon-button"
                  data-edit
                  aria-label={$t('demand.edit', { name })}
                  onclick={() => edit(d)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg
                  ></button
                >
                <button
                  type="button"
                  class="icon-button"
                  aria-label={$t('demand.delete', { name })}
                  aria-describedby={describe('row')}
                  onclick={() => askDelete(d, row.who.length)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M6 6l12 12M18 6L6 18" /></svg
                  ></button
                >
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      <FieldError {problems} id="row" />
    {/if}

    {#if ws.roles.length === 0}
      <p class="empty">{$t('team.members.needs')}</p>
    {:else}
      <form class="row add-row" data-no-present onsubmit={add}>
        <div class="field grow">
          <label for="{uid}-skill">{$t('demand.skill')}</label>
          <select id="{uid}-skill" onchange={(e) => (addSkill = e.currentTarget.value)}>
            {@render skillOptions(skillChoice)}
          </select>
        </div>
        {#if roleOnly}
          <div class="field grow">
            <label for="{uid}-role">{$t('demand.role')}</label>
            <select id="{uid}-role" onchange={(e) => (addRole = e.currentTarget.value)}>
              {@render roleOptions(roleChoice)}
            </select>
          </div>
        {/if}
        <div class="field fte-field">
          <label for="{uid}-fte">{$t('demand.fte')}</label>
          <input
            id="{uid}-fte"
            type="number"
            min="0.1"
            step="0.1"
            placeholder="1"
            value={addFte ?? ''}
            aria-invalid={invalid('add')}
            aria-describedby={describe('add')}
            oninput={(e) => {
              const v = e.currentTarget.value;
              addFte = v.trim() === '' ? null : Number(v);
              clear('add');
            }}
          />
        </div>
        <button type="submit" class="primary add" data-demand-add>{$t('demand.add')}</button>
      </form>
      <FieldError {problems} id="add" />
    {/if}
  {/key}

  {#if !roleOnly && defaultRole}
    <p class="hint joins" data-no-present>
      {$t('demand.joins', { role: roleName(defaultRole), team: team.name })}
    </p>
  {/if}
  <button
    type="button"
    class="link"
    data-no-present
    aria-expanded={whyOpen}
    aria-controls="{uid}-why"
    onclick={() => (whyOpen = !whyOpen)}>{$t('demand.why')}</button
  >
  <div class="why" id="{uid}-why" hidden={!whyOpen} data-no-present>
    <div>
      <h4>{$t('demand.why.role')}</h4>
      <p>{$t('demand.why.role.text')}</p>
    </div>
    <div>
      <h4>{$t('demand.why.skill')}</h4>
      <p>{$t('demand.why.skill.text')}</p>
    </div>
    <p class="note">{$t('demand.why.note')}</p>
  </div>

  {#if min}
    <div class="min" data-min-commitment>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" /></svg
      >
      <p>
        <strong
          >{$t('demand.min', {
            fte: fte(min.fte),
            hours: hours(min.hours),
          })}</strong
        >
        {$t('demand.min.why', { team: team.name, max: maxShare })}
      </p>
    </div>
  {/if}
</section>

<section class="card meetings" aria-labelledby="{uid}-m-h" data-role-meetings>
  <h3 id="{uid}-m-h">{$t('demand.meetings')}</h3>
  {#if focusRole}
    <p class="hint">{$t('demand.meetings.hint', { role: roleName(focusRole), team: team.name })}</p>
    {#if meetings.length === 0}
      <p class="empty">
        {$t('demand.meetings.none', { role: roleName(focusRole), team: team.name })}
      </p>
    {:else}
      <table>
        <caption class="sr-only"
          >{$t('demand.meetings.caption', { role: roleName(focusRole), team: team.name })}</caption
        >
        <thead>
          <tr>
            <th scope="col">{$t('demand.meetings.meeting')}</th>
            <th scope="col" class="num">{$t('demand.meetings.hours')}</th>
          </tr>
        </thead>
        <tbody>
          {#each meetings as m (m.unitId + m.event.id)}
            <tr>
              <th scope="row"
                >{m.event.name}{#if unitName(m.unitId)}<span class="from">
                    · {unitName(m.unitId)}</span
                  >{/if}</th
              >
              <td class="num">{$t('demand.hoursValue', { n: hours(m.hours) })}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{$t('demand.meetings.sum')}</th>
            <td class="num" data-meeting-sum>{$t('demand.hoursValue', { n: hours(meetingSum) })}</td
            >
          </tr>
        </tfoot>
      </table>
    {/if}
  {/if}
</section>

{#if staffing && !$presenting}
  <AssignDialog {team} demand={staffing} onclose={closeStaffing} />
{/if}

<ConfirmDialog
  open={deleting !== null}
  title={$t('demand.delete.title', { name: deleting ? label(deleting.demand) : '' })}
  message={$t(
    deleting?.people === 1 ? 'demand.delete.message.one' : 'demand.delete.message.other',
    {
      n: deleting?.people ?? 0,
      team: team.name,
    },
  )}
  confirmLabel={$t('demand.delete.confirm')}
  discard={false}
  onchoose={onDeleteChoice}
/>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
  }
  h3 {
    margin: 0 0 0.35rem;
  }
  .sum {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .hint,
  .empty {
    margin: 0.5rem 0 1rem;
    color: var(--text-muted);
  }
  .heads,
  .rows > li {
    display: grid;
    grid-template-columns: minmax(7rem, 1.3fr) 4.5rem 4.5rem minmax(6rem, 2fr) auto;
    gap: 0.75rem;
    align-items: center;
  }
  .heads {
    margin-top: 0.5rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .heads::after {
    content: '';
    width: 5.5rem;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rows > li {
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
  }
  .nums {
    display: contents;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .short {
    color: var(--warn);
    font-weight: 600;
  }
  .what {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    min-width: 0;
  }
  .what small {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .skill {
    max-width: 100%;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.85rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .skill.role-only {
    background: var(--surface-2);
    color: var(--text);
  }
  .who {
    font-size: 0.9rem;
    min-width: 0;
  }
  .nobody {
    color: var(--text-muted);
  }
  .people {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .people li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
  }
  .from {
    color: var(--text-muted);
  }
  .people li + li {
    margin-top: 0.3rem;
  }
  :global(#app) .demand button.staff {
    display: block;
    min-height: 2.75rem;
    margin-left: -0.15rem;
    padding: 0 0.15rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .tools {
    display: flex;
    gap: 0.25rem;
  }
  .rows > li:has(form) {
    display: block;
  }
  /* On a phone a row stacks: the skill on top, the numbers and who below it. */
  @media (max-width: 40rem) {
    .heads {
      display: none;
    }
    .rows > li {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'what tools'
        'nums nums'
        'who who';
      gap: 0.3rem 0.75rem;
    }
    .what {
      grid-area: what;
    }
    .tools {
      grid-area: tools;
    }
    .nums {
      grid-area: nums;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
    }
    .who {
      grid-area: who;
    }
    .rows .num {
      text-align: left;
    }
    .rows .sr-only {
      position: static;
      width: auto;
      height: auto;
      margin: 0;
      clip: auto;
      clip-path: none;
      overflow: visible;
      margin-right: 0.3rem;
      white-space: nowrap;
      color: var(--text-muted);
      font-weight: 400;
    }
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.75rem;
  }
  .add-row {
    margin-top: 1rem;
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
  .fte-field {
    width: 6.5rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .edit :global(.field-error) {
    flex-basis: 100%;
    margin: 0;
  }
  .joins {
    margin: 0.75rem 0 0;
  }
  :global(#app) .demand button.link {
    display: block;
    margin: 0 0 0.5rem -0.15rem;
    min-height: 2.75rem;
    padding: 0 0.15rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .why {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .why[hidden] {
    display: none;
  }
  .why > div {
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .why h4 {
    margin: 0 0 0.3rem;
  }
  .why p {
    margin: 0;
    font-size: 0.9rem;
  }
  .why .note {
    grid-column: 1 / -1;
    color: var(--text-muted);
  }
  .min {
    display: flex;
    gap: 0.6rem;
    padding: 0.75rem 0.9rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--text);
  }
  .min p {
    margin: 0;
  }
  .min svg {
    flex: none;
    margin-top: 0.15rem;
    color: var(--accent-text);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
    text-align: left;
    font-weight: 400;
  }
  thead th {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  tfoot th,
  tfoot td {
    border-bottom: 0;
    font-weight: 650;
  }
  td.num,
  th.num {
    text-align: right;
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
</style>
