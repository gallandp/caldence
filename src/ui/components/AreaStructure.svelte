<script lang="ts">
  import { tick } from 'svelte';
  import { areaAsTeam, eventAttendees, missingRoles, type Area, type Team } from '../../core/model';
  import { areaStructure, type Group, type StructurePerson } from '../../core/structure';
  import { locale, translate as t } from '../../i18n';
  import { ruleShort } from '../meetings/rules';
  import { initials, inkOn } from '../avatar';
  import AreaDialog from '../AreaDialog.svelte';
  import AreaIcon from './AreaIcon.svelte';
  import AreaPersonAdd from './AreaPersonAdd.svelte';
  import AreaPersonCard from './AreaPersonCard.svelte';
  import { workspace } from '../state/workspace';
  import { presenting } from '../state/present';
  import { structurePerson } from '../state/view';

  /** The structure page of an area: who works only in the area, in both, or only in a team. */
  let { area }: { area: Area } = $props();

  const s = $derived(areaStructure($workspace, area));
  const byId = $derived(new Map(s.people.map((p) => [p.personId, p])));
  const teams = $derived(area.teamIds.flatMap((id) => $workspace.teams.filter((x) => x.id === id)));
  const teamNames = $derived(new Map($workspace.teams.map((x) => [x.id, x.name])));
  const personNames = $derived(new Map($workspace.people.map((x) => [x.id, x.name])));
  const roleById = $derived(new Map($workspace.roles.map((x) => [x.id, x])));
  const teamName = (id: string) => teamNames.get(id) ?? id;
  const personName = (id: string) => personNames.get(id) ?? id;
  const role = (id: string | undefined) => (id === undefined ? undefined : roleById.get(id));
  const roleName = (id: string | undefined) => role(id)?.name ?? '';
  const h = (n: number) =>
    `${new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n)} h`;

  const GROUPS: { id: Group; key: string }[] = [
    { id: 'area', key: 'area.group.areaOnly' },
    { id: 'both', key: 'area.group.both' },
    { id: 'team', key: 'area.group.teamOnly' },
  ];

  // ---------- what is highlighted ----------

  let show = $state<'tree' | 'table'>('tree');
  let filter = $state<Group | null>(null);
  let meetingId = $state<string | null>(null);
  /** The person whose card is open. */
  let selected = $state<string | null>(null);
  /** The person under the pointer or focus. */
  let hover = $state<string | null>(null);
  const active = $derived(hover ?? selected);

  // A person, meeting or team that is gone is no longer highlighted.
  $effect(() => {
    if (selected && !byId.has(selected)) selected = null;
    if (hover && !byId.has(hover)) hover = null;
    if (meetingId && !area.events.some((e) => e.id === meetingId)) meetingId = null;
  });

  const meeting = $derived(area.events.find((e) => e.id === meetingId));
  const invited = $derived(meeting ? new Set(eventAttendees($workspace, area.id, meeting)) : null);
  /** Teams lacking an invited role, each pair once (a meeting may list a role twice). */
  const missing = $derived(
    meeting
      ? missingRoles($workspace, area, meeting).filter(
          (m, i, all) => all.findIndex((x) => x.teamId === m.teamId && x.roleId === m.roleId) === i,
        )
      : [],
  );

  function lit(personId: string): boolean {
    if (active) return personId === active;
    const p = byId.get(personId);
    if (filter && p?.group !== filter) return false;
    return !invited || invited.has(personId);
  }

  // ---------- layout ----------

  let width = $state(1280);
  /** More than five teams or a narrow screen: one row per team instead of columns. */
  const list = $derived(teams.length > 5 || width <= 820);
  const narrow = $derived(width <= 820);
  /** Teams whose "only in the team" people are shown on phones. */
  let opened = $state<Record<string, boolean>>({});

  // ---------- connection lines ----------

  let root: HTMLElement | undefined = $state();
  let paths = $state<{ d: string; x: number; y: number }[]>([]);
  let start = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    void [active, list, show, width, s];
    void draw();
  });

  async function draw() {
    await tick();
    paths = [];
    start = null;
    if (!root || !active || list || show !== 'tree') return;
    const src = root.querySelector(`.areanode [data-p="${CSS.escape(active)}"] .av`);
    if (!src) return;
    const o = root.getBoundingClientRect();
    const a = src.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - o.left;
    const y1 = a.bottom - o.top + 3;
    const out: typeof paths = [];
    for (const el of root.querySelectorAll(`.team [data-p="${CSS.escape(active)}"] .av`)) {
      const v = el.getBoundingClientRect();
      const x2 = v.left + v.width / 2 - o.left;
      const y2 = v.top - o.top - 3;
      const my = (y1 + y2) / 2;
      out.push({ d: `M${x1} ${y1} C${x1} ${my} ${x2} ${my - 40} ${x2} ${y2}`, x: x2, y: y2 });
    }
    if (out.length === 0) return;
    start = { x: x1, y: y1 };
    paths = out;
  }

  // ---------- card and dialogs ----------

  let card: AreaPersonCard | undefined = $state();
  let adder: AreaPersonAdd | undefined = $state();
  let teamsDialog: AreaDialog | undefined = $state();
  let addButton: HTMLButtonElement | undefined = $state();
  let teamsButton: HTMLButtonElement | undefined = $state();

  /** Opens "Choose teams" for the area (the "area is ready" card). */
  export function chooseTeams() {
    teamsDialog?.show(area);
  }

  /** Opens "+ Person" for the area (the "area is ready" card). */
  export function addPerson() {
    adder?.show(addButton);
  }

  function pick(personId: string, event: Event, focusHours = false) {
    if (selected === personId && !focusHours) {
      selected = null;
      return;
    }
    selected = personId;
    hover = null;
    void card?.open(event.currentTarget as HTMLElement, focusHours);
  }

  /** After adding: the new person's tile in the area node gets the focus and a short pulse. */
  async function focusPerson(personId: string) {
    await tick();
    const tile = root?.querySelector<HTMLElement>(`.areanode [data-p="${CSS.escape(personId)}"]`);
    if (!tile) return;
    tile.focus();
    tile.classList.add('pulse');
    setTimeout(() => tile.classList.remove('pulse'), 1600);
  }

  /** A link to this page at a person (#361): their card opens at the hours in the area. */
  $effect(() => {
    const id = $structurePerson;
    if (!id) return;
    structurePerson.set(undefined);
    void tick().then(() => {
      const tile = root?.querySelector<HTMLElement>(`[data-p="${CSS.escape(id)}"]`);
      if (!tile) return;
      tile.scrollIntoView({ block: 'center' });
      selected = id;
      void card?.open(tile, true);
    });
  });

  function enter(personId: string) {
    hover = personId;
  }
  function leave() {
    hover = null;
  }

  const avatarColour = (p: StructurePerson) =>
    role(p.group === 'area' ? p.areaRoleIds[0] : p.teams[0]?.roleIds[0])?.colour ?? '#5340e6';

  const teamCount = (n: number) =>
    n === 1 ? $t('area.structure.teamMeta.one') : $t('area.structure.teamMeta.other', { n });
  const teamMeta = (team: Team) =>
    [
      teamCount(new Set(team.members.map((m) => m.personId)).size),
      $t('team.switcher.meta', {
        kind: $t(`team.cadence.kind.${team.cadence.kind}`),
        weeks: team.cadence.lengthWeeks,
      }),
    ].join(' · ');

  /** "Product Owner" or the area role, and where they come from ("from Alpha, Beta"). */
  const fromLine = (p: StructurePerson) =>
    $t('area.structure.origin', { teams: p.teams.map((x) => teamName(x.teamId)).join(', ') });

  const areaMeta = $derived(
    [
      $t('area.meta', {
        count:
          teams.length === 1 ? $t('area.count.one') : $t('area.count.other', { n: teams.length }),
      }),
      area.cadence ? $t('area.structure.cadence', { weeks: area.cadence.lengthWeeks }) : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  const areaTeam = $derived(areaAsTeam(area));

  // Table rows, one per person, grouped.
  const otherCol = $derived(s.people.some((p) => p.otherHours > 0));
</script>

<svelte:window bind:innerWidth={width} />

{#snippet avatar(p: StructurePerson)}
  {@const c = avatarColour(p)}
  <span class="av" style:background={c} style:color={inkOn(c)} aria-hidden="true"
    >{initials(personName(p.personId))}</span
  >
{/snippet}

<div class="structure">
  <div class="top">
    <div class="comp">
      <div class="compbar" aria-hidden="true">
        {#each GROUPS as g (g.id)}
          {#if s.counts[g.id] > 0}<i class="k-{g.id}" style:flex={s.counts[g.id]}></i>{/if}
        {/each}
      </div>
      <div class="compbtns" role="group" aria-label={$t('area.structure.highlight')}>
        {#each GROUPS as g (g.id)}
          <button
            type="button"
            aria-pressed={filter === g.id}
            onclick={() => {
              filter = filter === g.id ? null : g.id;
              selected = null;
            }}
          >
            <i class="dot k-{g.id}" aria-hidden="true"></i><b>{s.counts[g.id]}</b>
            {$t(g.key)}
          </button>
        {/each}
      </div>
    </div>
    <div class="segmented" data-no-print role="group" aria-label={$t('area.structure.show')}>
      {#each ['tree', 'table'] as const as v (v)}
        <button type="button" aria-pressed={show === v} onclick={() => (show = v)}
          >{$t(`area.structure.${v}`)}</button
        >
      {/each}
    </div>
  </div>

  {#if show === 'table'}
    <div class="tablewrap">
      <table>
        <caption class="sr-only">{$t('area.structure.caption', { name: area.name })}</caption>
        <thead>
          <tr>
            <th scope="col">{$t('area.structure.person')}</th>
            <th scope="col" class="a">{area.name}</th>
            {#each teams as team (team.id)}<th scope="col">{team.name}</th>{/each}
            {#if otherCol}<th scope="col">{$t('area.structure.otherTeams')}</th>{/if}
            <th scope="col">{$t('area.structure.total')}</th>
          </tr>
        </thead>
        {#each GROUPS as g (g.id)}
          {@const rows = s.people.filter((p) => p.group === g.id)}
          {#if rows.length > 0}
            <tbody>
              <tr class="grp">
                <th scope="colgroup" colspan={teams.length + 3 + (otherCol ? 1 : 0)}>
                  <span
                    ><i class="dot k-{g.id}" aria-hidden="true"></i>{$t(g.key)} · {rows.length}</span
                  >
                </th>
              </tr>
              {#each rows as p (p.personId)}
                <tr class:dim={!lit(p.personId)}>
                  <th scope="row">
                    <button
                      type="button"
                      class="who"
                      data-p={p.personId}
                      aria-pressed={selected === p.personId}
                      onclick={(e) => pick(p.personId, e)}
                    >
                      {@render avatar(p)}
                      <span
                        >{personName(p.personId)}<small
                          >{[
                            ...p.teams.flatMap((x) => x.roleIds).map(roleName),
                            ...p.areaRoleIds.map((r) =>
                              $t('area.structure.areaRole', { role: roleName(r) }),
                            ),
                          ]
                            .filter((x, i, all) => all.indexOf(x) === i)
                            .join(' · ')}</small
                        ></span
                      >
                    </button>
                  </th>
                  <td class="a"
                    >{#if p.areaHours > 0}<span>{h(p.areaHours)}</span>{/if}</td
                  >
                  {#each teams as team (team.id)}
                    {@const x = p.teams.find((y) => y.teamId === team.id)}
                    <td class="t"
                      >{#if x}<span>{h(x.hours)}</span>{/if}</td
                    >
                  {/each}
                  {#if otherCol}<td
                      >{#if p.otherHours > 0}{h(p.otherHours)}{/if}</td
                    >{/if}
                  <td class="sum">{h(p.total)}</td>
                </tr>
              {/each}
            </tbody>
          {/if}
        {/each}
      </table>
    </div>
  {:else}
    <div class="root" bind:this={root}>
      <svg class="lines" aria-hidden="true">
        {#each paths as p, i (i)}
          <path class="halo" d={p.d} /><path class="flow" d={p.d} /><circle
            cx={p.x}
            cy={p.y}
            r="4"
          />
        {/each}
        {#if start}<circle cx={start.x} cy={start.y} r="4" />{/if}
      </svg>

      <section class="areanode" aria-labelledby="areanode-name">
        <div class="areahead">
          <span class="unitav" aria-hidden="true"><AreaIcon /></span>
          <div class="areatitle">
            <h3 id="areanode-name">{area.name}</h3>
            <small>{areaMeta}</small>
          </div>
          <div class="tot">
            <b>{h(s.areaHours)}</b>
            <small>{$t('area.structure.perWeek')}</small>
          </div>
          <div class="areaactions" data-no-present>
            <button
              type="button"
              class="secondary add"
              bind:this={addButton}
              onclick={() => adder?.show(addButton)}>{$t('area.structure.add')}</button
            >
            <button
              type="button"
              class="secondary"
              bind:this={teamsButton}
              onclick={() => teamsDialog?.show(area)}>{$t('area.teams')}</button
            >
          </div>
        </div>
        <div class="areabody">
          <div class="zone only">
            <h4 class="cap">
              <i class="dot k-area" aria-hidden="true"></i>{$t('area.group.areaOnly')}
              <span class="n">· {s.counts.area}</span>
            </h4>
            {#each s.people.filter((p) => p.group === 'area') as p (p.personId)}
              <button
                type="button"
                class="person inarea"
                class:dim={!lit(p.personId)}
                class:sel={active === p.personId}
                data-p={p.personId}
                aria-pressed={selected === p.personId}
                onclick={(e) => pick(p.personId, e)}
                onpointerenter={() => enter(p.personId)}
                onpointerleave={leave}
                onfocus={() => enter(p.personId)}
                onblur={leave}
              >
                {@render avatar(p)}
                <span class="tx"
                  ><b>{personName(p.personId)}</b><small
                    >{p.areaRoleIds.map(roleName).join(', ')}</small
                  ></span
                >
                <span class="h a">{h(p.areaHours)}</span>
              </button>
            {:else}
              <p class="none">{$t('area.structure.nobody')}</p>
            {/each}
          </div>
          <div class="zone from">
            <h4 class="cap">
              <i class="dot k-both" aria-hidden="true"></i>{$t('area.group.both')}
              <span class="n">· {s.counts.both}</span>
            </h4>
            <div class="fromgrid">
              {#each s.people.filter((p) => p.group === 'both') as p (p.personId)}
                <button
                  type="button"
                  class="person inarea"
                  class:dim={!lit(p.personId)}
                  class:sel={active === p.personId}
                  data-p={p.personId}
                  aria-pressed={selected === p.personId}
                  onclick={(e) => pick(p.personId, e, p.invitedOnly)}
                  onpointerenter={() => enter(p.personId)}
                  onpointerleave={leave}
                  onfocus={() => enter(p.personId)}
                  onblur={leave}
                >
                  {@render avatar(p)}
                  <span class="tx"
                    ><b>{personName(p.personId)}</b><small
                      >{roleName(p.areaRoleIds[0] ?? p.teams[0]?.roleIds[0])}</small
                    ><small class="org">{fromLine(p)}</small>{#if p.invitedOnly}<small class="unset"
                        >{#if $presenting}{$t('area.hours.none')}{:else}<span data-no-print
                            >{$t('area.hours.unset')}</span
                          ><span data-print-only>{$t('area.hours.none')}</span>{/if}</small
                      >{/if}</span
                  >
                  {#if !p.invitedOnly}<span class="h a">{h(p.areaHours)}</span>{/if}
                </button>
              {:else}
                <p class="none">{$t('area.structure.nobody')}</p>
              {/each}
            </div>
          </div>
        </div>
        {#if area.events.length > 0}
          <div class="areafoot">
            <h4 class="cap">{$t('area.structure.meetings')}</h4>
            {#each area.events as e (e.id)}
              <button
                type="button"
                class="chipbtn"
                aria-pressed={meetingId === e.id}
                onclick={() => {
                  meetingId = meetingId === e.id ? null : e.id;
                  selected = null;
                }}
                >{e.name}
                <small>{ruleShort(e.rule, areaTeam, $t, $locale)}</small></button
              >
            {/each}
          </div>
        {/if}
      </section>

      <div class="tree" class:list style:--n={Math.max(teams.length, 1)}>
        {#if !list && teams.length > 0}
          <div class="trunk" aria-hidden="true"></div>
          {#each teams as team, i (team.id)}
            <div
              class="drop"
              class:first={i === 0}
              class:last={i === teams.length - 1}
              aria-hidden="true"
            ></div>
          {/each}
        {/if}
        {#each s.teams as st (st.teamId)}
          {@const team = teams.find((x) => x.id === st.teamId)!}
          {@const gaps = missing.filter((m) => m.teamId === st.teamId)}
          {@const open = opened[st.teamId] ?? false}
          <section
            class="team"
            class:hit={!!active && [...st.both, ...st.only].includes(active)}
            aria-labelledby="team-{st.teamId}"
          >
            <div class="thead">
              <span class="teamav" aria-hidden="true">{initials(team.name)}</span>
              <div>
                <h4 id="team-{st.teamId}">{team.name}</h4>
                <small>{teamMeta(team)}</small>
              </div>
            </div>
            <div class="tboth">
              <h5 class="cap">
                <i class="dot k-both" aria-hidden="true"></i>{$t('area.group.both')}
                <span class="n">· {st.both.length}</span>
              </h5>
              {#each st.both as id (id)}
                {@const p = byId.get(id)!}
                {@const own = p.teams.find((x) => x.teamId === st.teamId)!}
                <button
                  type="button"
                  class="person bridge"
                  class:dim={!lit(id)}
                  class:sel={active === id}
                  data-p={id}
                  aria-pressed={selected === id}
                  onclick={(e) => pick(id, e)}
                  onpointerenter={() => enter(id)}
                  onpointerleave={leave}
                  onfocus={() => enter(id)}
                  onblur={leave}
                >
                  {@render avatar(p)}
                  <span class="tx">
                    <b>{personName(id)}</b>
                    <small>{own.roleIds.map(roleName).join(', ')}</small>
                    {#if p.areaRoleIds.length > 0 && !p.areaRoleIds.every( (r) => own.roleIds.includes(r) )}
                      <small class="ar"
                        >{$t('area.structure.areaRole', {
                          role: p.areaRoleIds.map(roleName).join(', '),
                        })}</small
                      >
                    {/if}
                    <span class="split" aria-hidden="true"
                      ><i style:flex={own.hours}></i><i class="a" style:flex={p.areaHours}
                      ></i></span
                    >
                    <span class="splitlbl"
                      ><span>{h(own.hours)} {$t('area.structure.inTeam')}</span
                      >{#if p.invitedOnly}<span class="unset"
                          >{#if $presenting}{$t('area.hours.none')}{:else}<span data-no-print
                              >{$t('area.hours.unset')}</span
                            ><span data-print-only>{$t('area.hours.none')}</span>{/if}</span
                        >{:else}<span class="a">{h(p.areaHours)} {$t('area.structure.inArea')}</span
                        >{/if}</span
                    >
                  </span>
                </button>
              {/each}
              {#each gaps as g (g.roleId)}
                <p class="gap">
                  <svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M12 3l9.5 17h-19zM12 10v4M12 17h.01" /></svg
                  >
                  {$t('area.missingRole', { team: team.name, role: roleName(g.roleId) })}
                </p>
              {/each}
              {#if st.both.length === 0 && gaps.length === 0}
                <p class="none">{$t('area.structure.nobody')}</p>
              {/if}
            </div>
            <div class="tonly" class:open>
              <h5 class="cap">
                <i class="dot k-team" aria-hidden="true"></i>{$t('area.group.teamOnly')}
                <span class="n">· {st.only.length}</span>
                {#if narrow && st.only.length > 0}
                  <button
                    type="button"
                    class="more"
                    aria-expanded={open}
                    onclick={() => (opened = { ...opened, [st.teamId]: !open })}
                    >{$t(open ? 'area.structure.hide' : 'area.structure.showAll')}<span
                      class="sr-only">: {team.name}</span
                    ></button
                  >
                {/if}
              </h5>
              {#if !narrow || open}
                {#each st.only as id (id)}
                  {@const p = byId.get(id)!}
                  {@const own = p.teams.find((x) => x.teamId === st.teamId)!}
                  <button
                    type="button"
                    class="person"
                    class:dim={!lit(id)}
                    class:sel={active === id}
                    data-p={id}
                    aria-pressed={selected === id}
                    onclick={(e) => pick(id, e)}
                    onpointerenter={() => enter(id)}
                    onpointerleave={leave}
                    onfocus={() => enter(id)}
                    onblur={leave}
                  >
                    {@render avatar(p)}
                    <span class="tx"
                      ><b>{personName(id)}</b><small>{own.roleIds.map(roleName).join(', ')}</small
                      ></span
                    >
                    <span class="h">{h(own.hours)}</span>
                  </button>
                {/each}
              {/if}
            </div>
          </section>
        {:else}
          <div class="empty-teams">
            <p>{$t('area.empty.teams', { name: area.name })}</p>
            <button type="button" class="primary" onclick={() => teamsDialog?.show(area)}
              >{$t('area.teams')}</button
            >
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<AreaPersonCard
  bind:this={card}
  {area}
  personId={selected}
  person={selected ? byId.get(selected) : undefined}
  onclose={() => (selected = null)}
  ongone={() => addButton?.focus()}
/>
<AreaPersonAdd bind:this={adder} {area} onadded={focusPerson} />
<AreaDialog bind:this={teamsDialog} returnFocus={() => teamsButton?.focus()} />

<style>
  .structure {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .comp {
    flex: 1 1 28rem;
  }
  .k-area {
    background: var(--area);
  }
  .k-team {
    background: var(--accent);
  }
  .k-both {
    background: linear-gradient(90deg, var(--area), var(--accent));
  }
  .dot {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    flex: none;
  }

  /* composition: legend and filter in one */
  .comp {
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .compbar {
    display: flex;
    gap: 3px;
    height: 0.625rem;
    margin-bottom: 0.5rem;
  }
  .compbar i {
    min-width: 0.875rem;
    border-radius: 5px;
  }
  .compbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  :global(#app) .compbtns button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.65rem 0.3rem 0.5rem;
    border-color: transparent;
    background: none;
    box-shadow: none;
    font-weight: 400;
  }
  :global(#app) .compbtns button:hover {
    background: var(--surface-2);
  }
  :global(#app) .compbtns button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 600;
  }
  .compbtns b {
    font-variant-numeric: tabular-nums;
  }

  /* people */
  .av {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .inarea .av,
  .bridge .av {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--area);
  }
  :global(#app) .person {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-color: transparent;
    border-radius: 0.625rem;
    background: none;
    box-shadow: none;
    font-weight: 400;
    text-align: left;
    transition: opacity 0.15s;
  }
  :global(#app) .person:hover {
    background: var(--surface-2);
  }
  :global(#app) .person.sel {
    border-color: var(--area);
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--area);
  }
  :global(#app) .bridge,
  :global(#app) .from .person {
    align-items: flex-start;
    border-color: var(--area-line);
    background: var(--surface);
  }
  :global(#app) .bridge {
    padding: 0.5rem;
  }
  .dim {
    opacity: 0.25;
  }
  :global(#app) .person:global(.pulse) {
    animation: pulse 0.8s ease-out 2;
  }
  @keyframes pulse {
    from {
      box-shadow: 0 0 0 0 var(--area);
    }
    to {
      box-shadow: 0 0 0 0.5rem transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(#app) .person:global(.pulse) {
      animation: none;
    }
  }
  .tx {
    flex: 1;
    min-width: 0;
  }
  .tx b,
  .tx small {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .tx b {
    font-weight: 600;
  }
  .tx small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .tx small.ar {
    color: var(--area);
  }
  .h {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .h.a,
  .splitlbl .a {
    color: var(--area);
    font-weight: 600;
  }
  .unset {
    color: var(--warn);
    font-weight: 600;
  }
  .tx small.unset {
    color: var(--warn);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  :global(#app) .areaactions button {
    min-height: 2.5rem;
  }
  :global(#app) .areaactions .add {
    border-color: var(--area);
    color: var(--area);
    font-weight: 600;
  }
  .split {
    display: flex;
    gap: 2px;
    height: 5px;
    margin: 0.375rem 0 0.2rem;
    overflow: hidden;
    border-radius: 3px;
  }
  .split i {
    border-radius: 3px;
    background: var(--accent);
  }
  .split i.a {
    background: var(--area);
  }
  .splitlbl {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .cap {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0 0 0.375rem;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .cap .n {
    font-weight: 400;
  }
  .none {
    margin: 0;
    padding: 0.25rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .empty-teams {
    padding: 0.75rem 0;
    font-size: 0.95rem;
  }
  .empty-teams p {
    margin: 0 0 0.6rem;
  }

  /* area node */
  .root {
    position: relative;
  }
  .lines {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .lines path {
    fill: none;
    stroke: var(--area);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .lines .flow {
    stroke-dasharray: 6 5;
    animation: flow 1.2s linear infinite;
  }
  .lines .halo {
    stroke: var(--bg);
    stroke-width: 6;
    opacity: 0.55;
  }
  .lines circle {
    fill: var(--area);
  }
  @keyframes flow {
    to {
      stroke-dashoffset: -11;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lines .flow {
      animation: none;
    }
  }
  .areanode {
    max-width: 61rem;
    margin: 0 auto;
    overflow: hidden;
    border: 1.5px solid var(--area-line);
    border-radius: 1rem;
    background: var(--surface);
  }
  .areahead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
  }
  .unitav {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: linear-gradient(135deg, #14b8a6, #22c3ee);
    color: #fff;
    font-size: 1.25rem;
  }
  .areatitle h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .areatitle small,
  .tot small {
    color: var(--text-muted);
  }
  .tot {
    margin-left: auto;
    text-align: right;
  }
  .tot b {
    display: block;
    font-size: 1.25rem;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .areaactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .areabody {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    border-top: 1px solid var(--border);
    background: var(--area-soft);
  }
  .zone {
    padding: 0.75rem 0.875rem;
  }
  .zone.only .inarea .av {
    box-shadow:
      0 0 0 2px var(--area-soft),
      0 0 0 4px var(--area);
  }
  .zone.from {
    border-left: 1px solid var(--area-line);
  }
  .fromgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.375rem;
  }
  .areafoot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.5rem;
    padding: 0.625rem 0.875rem;
    border-top: 1px solid var(--border);
  }
  .areafoot .cap {
    margin: 0 0.25rem 0 0;
  }
  :global(#app) .chipbtn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.7rem;
    border-color: var(--border);
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 500;
  }
  .chipbtn small {
    color: var(--text-muted);
  }
  :global(#app) .chipbtn[aria-pressed='true'] {
    border-color: var(--area);
    background: var(--area);
    color: var(--surface);
    font-weight: 600;
  }
  :global(#app) .chipbtn[aria-pressed='true'] small {
    color: inherit;
  }

  /* tree */
  .tree {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    grid-template-rows: 14px 22px auto auto auto;
    column-gap: 1rem;
  }
  .trunk {
    grid-column: 1 / -1;
    justify-self: center;
    width: 2px;
    background: var(--area-line);
  }
  .drop {
    position: relative;
  }
  .drop::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - 1px);
    width: 2px;
    background: var(--area-line);
    content: '';
  }
  .drop::after {
    position: absolute;
    top: 0;
    right: -0.5rem;
    left: -0.5rem;
    height: 2px;
    background: var(--area-line);
    content: '';
  }
  .drop.first::after {
    left: calc(50% - 1px);
  }
  .drop.last::after {
    right: calc(50% - 1px);
  }
  .drop.first.last::after {
    display: none;
  }
  .team {
    display: grid;
    grid-row: span 3;
    grid-template-rows: subgrid;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .team.hit {
    border-color: var(--area);
    box-shadow: 0 0 0 1px var(--area);
  }
  .thead {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.75rem 0.75rem 0.625rem;
    border-top: 3px solid var(--accent);
  }
  .thead h4 {
    margin: 0;
    font-size: 0.95rem;
  }
  .thead small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .teamav {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: 0.55rem;
    background: linear-gradient(135deg, #8b7bff, #5340e6);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .tboth {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.625rem;
    border-block: 1px solid var(--border);
    background: var(--area-soft);
  }
  .tonly {
    display: flex;
    flex-direction: column;
    padding: 0.625rem 0.375rem;
  }
  .tonly .cap {
    margin-left: 0.5rem;
  }
  .gap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0.45rem 0.55rem;
    border: 1.5px dashed var(--warn);
    border-radius: 0.625rem;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.8rem;
  }
  .gap svg {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  :global(#app) .more {
    margin-left: auto;
    padding: 0.1rem 0.25rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-size: 0.8rem;
  }

  /* list: one row per team */
  .tree.list {
    display: block;
    position: relative;
    padding-left: 1.625rem;
  }
  .tree.list::before {
    position: absolute;
    top: 0;
    bottom: 2.5rem;
    left: 0.625rem;
    width: 2px;
    background: var(--area-line);
    content: '';
  }
  .tree.list .team {
    position: relative;
    grid-template-columns: 14rem minmax(0, 1.2fr) minmax(0, 1fr);
    grid-template-rows: auto;
    margin-top: 0.75rem;
    overflow: visible;
  }
  .tree.list .team::before {
    position: absolute;
    top: 1.625rem;
    left: -1.0625rem;
    width: 1rem;
    height: 2px;
    background: var(--area-line);
    content: '';
  }
  .tree.list .thead {
    border-top: 0;
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }
  .tree.list .tboth {
    flex-flow: row wrap;
    align-content: flex-start;
    border-block: 0;
    border-inline: 1px solid var(--border);
  }
  .tree.list .cap {
    width: 100%;
    margin-left: 0;
  }
  :global(#app) .tree.list .tboth .bridge {
    flex: 1 1 11rem;
    width: auto;
    max-width: 16rem;
  }
  .tree.list .tonly {
    flex-flow: row wrap;
    align-content: flex-start;
    gap: 0.25rem;
    padding: 0.625rem;
  }
  :global(#app) .tree.list .tonly .person {
    gap: 0.375rem;
    width: auto;
    padding: 0.2rem 0.55rem 0.2rem 0.2rem;
    border-radius: 99px;
    background: var(--surface-2);
  }
  .tree.list .tonly .av {
    width: 1.375rem;
    height: 1.375rem;
    font-size: 0.625rem;
  }
  .tree.list .tonly small,
  .tree.list .tonly .h {
    display: none;
  }
  .tree.list .tonly b {
    font-size: 0.8rem;
    font-weight: 500;
  }

  /* table */
  .tablewrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  th,
  td {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  thead th:first-child,
  tbody th[scope='row'] {
    position: sticky;
    left: 0;
    z-index: 1;
    text-align: left;
  }
  tbody th[scope='row'] {
    background: var(--surface);
  }
  thead th.a {
    color: var(--area);
  }
  tr.grp th {
    background: var(--surface-2);
    font-size: 0.75rem;
    text-align: left;
  }
  tr.grp span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  td.a span {
    padding: 0.1rem 0.45rem;
    border-radius: 0.375rem;
    background: var(--area-soft);
    color: var(--area);
    font-weight: 600;
  }
  td.t span {
    padding: 0.1rem 0.45rem;
    border-radius: 0.375rem;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  td.sum {
    font-weight: 600;
  }
  :global(#app) .who {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.15rem 0.3rem;
    border-color: transparent;
    background: none;
    box-shadow: none;
    font-weight: 500;
    text-align: left;
  }
  :global(#app) .who[aria-pressed='true'] {
    border-color: var(--area);
  }
  .who small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 400;
  }
  .who .av {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.68rem;
  }

  @media (max-width: 820px) {
    .areabody {
      grid-template-columns: 1fr;
    }
    .zone.from {
      border-top: 1px solid var(--area-line);
      border-left: 0;
    }
    .tot {
      margin-left: auto;
    }
    .areaactions {
      flex: 1 1 100%;
    }
    :global(#app) .areaactions button {
      flex: 1;
    }
    .tree.list {
      padding-left: 1.125rem;
    }
    .tree.list::before {
      left: 0.3rem;
    }
    .tree.list .team {
      grid-template-columns: 1fr;
    }
    .tree.list .team::before {
      left: -0.8rem;
      width: 0.75rem;
    }
    .tree.list .thead {
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
    .tree.list .tboth {
      flex-direction: column;
      border-block: 1px solid var(--border);
      border-inline: 0;
    }
    :global(#app) .tree.list .tboth .bridge {
      flex: none;
      width: 100%;
      max-width: none;
    }
    .fromgrid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    :global(#app) .from .person {
      align-items: center;
      gap: 0.375rem;
      width: auto;
      padding: 0.2rem 0.55rem 0.2rem 0.2rem;
      border-radius: 99px;
    }
    .from .av {
      width: 1.375rem;
      height: 1.375rem;
      font-size: 0.625rem;
    }
    .from small:not(.unset) {
      display: none;
    }
    .from b {
      font-size: 0.8rem;
      font-weight: 500;
    }
    tbody th[scope='row'] {
      min-width: 9rem;
      white-space: normal;
    }
  }
</style>
