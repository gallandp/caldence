<script lang="ts">
  import { tick } from 'svelte';
  import { minCommitment } from '../../core/demand';
  import type { LineUnit, Person, Team } from '../../core/model';
  import {
    boardPeople,
    fits,
    lineFamily,
    openDemands,
    personSkills,
    type OpenDemand,
    type PlatformGroup,
  } from '../../core/staffing';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import { workspace } from '../state/workspace';
  import AssignDialog from './AssignDialog.svelte';
  import OwnerAvatars from './OwnerAvatars.svelte';

  /**
   * The staffing tab of a line team (#319): its people on the left, the open demands of its skill
   * family on the right, grouped by platform. Select first: choosing a person highlights the
   * demands with a matching skill, moves them to the top and opens only their platforms; each row
   * then offers "Anna zuordnen". Dragging a person onto a row is an optional extra. Both open the
   * staffing dialog with its effect check (#320); a toast offers undo.
   */
  let { unit }: { unit: LineUnit } = $props();
  const uid = $props.id();

  const ws = $derived($workspace);
  const fte = (n: number) => formatNumber($locale, n, 1);
  const familyId = $derived(lineFamily(ws, unit.id));
  const family = $derived(ws.skillFamilies?.find((f) => f.id === familyId));
  const skillName = $derived(new Map((ws.skills ?? []).map((s) => [s.id, s.name])));
  const roleName = (id: string) => ws.roles.find((r) => r.id === id)?.name ?? id;
  const names = $derived(new Map(ws.people.map((p) => [p.id, p.name])));
  const personName = (id: string) => names.get(id) ?? id;
  const what = (row: OpenDemand) =>
    row.demand.skillId !== undefined
      ? (skillName.get(row.demand.skillId) ?? '')
      : roleName(row.demand.roleId);

  // ---------- people ----------

  const people = $derived(boardPeople(ws, unit.id, $locale));
  const totalFree = $derived(Math.round(people.reduce((s, p) => s + p.free, 0) * 100) / 100);
  /** Skills the line team's people hold, in the file's order. */
  const teamSkills = $derived.by(() => {
    const held = new Set(people.flatMap((p) => p.person.skillIds ?? []));
    return (ws.skills ?? []).filter((s) => held.has(s.id));
  });

  let personQuery = $state('');
  let skillFilter = $state<string | null>(null);
  let freeOnly = $state(true);
  const withFree = $derived(people.filter((p) => p.free > 0));
  const shownPeople = $derived.by(() => {
    const q = personQuery.trim().toLocaleLowerCase($locale);
    // The selected person stays visible, also once their free time is used up.
    return people.filter(
      (p) =>
        p.person.id === selectedId ||
        ((!freeOnly || p.free > 0) &&
          (skillFilter === null || (p.person.skillIds ?? []).includes(skillFilter)) &&
          (q === '' || p.person.name.toLocaleLowerCase($locale).includes(q))),
    );
  });

  let selectedId = $state<string | null>(null);
  /** The selected person, while they are still in the line team. */
  const selected = $derived(
    selectedId === null ? undefined : people.find((p) => p.person.id === selectedId)?.person,
  );

  // ---------- demands ----------

  let productQuery = $state('');
  const groups = $derived(openDemands(ws, { family: familyId, query: productQuery }));
  const demandCount = $derived(groups.reduce((s, g) => s + g.rows.length, 0));
  /** Platforms among the groups; the group of products without one does not count. */
  const areaCount = $derived(groups.filter((g) => g.area).length);
  const matchCount = (g: PlatformGroup, p: Person | undefined) =>
    p ? g.rows.filter((r) => fits(p, r.demand)).length : 0;
  const totalMatches = $derived(groups.reduce((s, g) => s + matchCount(g, selected), 0));

  /** Rows of a platform: with a selected person, those with their skill first. */
  const rowsOf = (g: PlatformGroup, p: Person | undefined): OpenDemand[] =>
    p ? [...g.rows].sort((a, b) => Number(fits(p, b.demand)) - Number(fits(p, a.demand))) : g.rows;

  const groupKey = (g: PlatformGroup) => g.area?.id ?? '';
  /** Platforms opened by hand; undefined means the default: only the first one is open. */
  let opened = $state<string[] | undefined>(undefined);
  /** A product search opens every platform it finds; otherwise the hand-opened ones. */
  const isOpen = (g: PlatformGroup, i: number) =>
    productQuery.trim() !== '' || (opened === undefined ? i === 0 : opened.includes(groupKey(g)));
  function toggleGroup(g: PlatformGroup, i: number) {
    if (productQuery.trim() !== '') productQuery = '';
    const now = opened ?? groups.filter((x, j) => isOpen(x, j)).map(groupKey);
    opened = isOpen(g, i) ? now.filter((k) => k !== groupKey(g)) : [...now, groupKey(g)];
  }

  /** Selecting a person opens only the platforms with a matching demand. */
  function select(id: string | null) {
    refused = '';
    selectedId = selectedId === id ? null : id;
    const p = ws.people.find((x) => x.id === selectedId);
    if (!p) return;
    const withMatch = groups.filter((g) => matchCount(g, p) > 0).map(groupKey);
    if (withMatch.length > 0) opened = withMatch;
  }

  // ---------- assigning ----------

  let dragging = $state<string | null>(null);
  let dropTarget = $state<string | null>(null);
  const rowKey = (r: OpenDemand) => `${r.team.id}/${r.demand.id}`;
  /** The person shown highlighted against the rows: the dragged one, else the selected one. */
  const lens = $derived(dragging !== null ? ws.people.find((p) => p.id === dragging) : selected);

  let dialogFor = $state<{
    teamId: string;
    demandId: string;
    personId?: string;
    /** Open FTE when the dialog opened, to tell a full assignment from a partial one. */
    open: number;
  } | null>(null);
  const dialogTeam = $derived(
    dialogFor ? ws.teams.find((x) => x.id === dialogFor!.teamId) : undefined,
  );
  const dialogDemand = $derived(dialogTeam?.demands?.find((d) => d.id === dialogFor?.demandId));
  let returnTo: HTMLElement | null = null;

  function openDialog(row: OpenDemand, personId: string | undefined, from: HTMLElement | null) {
    returnTo = from;
    dialogFor = { teamId: row.team.id, demandId: row.demand.id, personId, open: row.open };
  }

  const isMember = (team: Team, personId: string) =>
    team.members.some((m) => m.personId === personId);

  let done = $state.raw<{ text: string; after: unknown } | null>(null);
  let undone = $state(false);
  let undoButton: HTMLButtonElement | undefined = $state();
  let root: HTMLElement | undefined = $state();
  let productSearch: HTMLInputElement | undefined = $state();
  /** A person dropped on a product they are already in: said here instead of opening the dialog. */
  let refused = $state('');

  async function assigned(personId: string, n: number) {
    const team = dialogTeam;
    if (!team || !dialogFor) return;
    const full = n >= dialogFor.open - 1e-9;
    undone = false;
    refused = '';
    done = {
      text: $t(full ? 'board.done.full' : 'board.done', {
        name: personName(personId),
        team: team.name,
        fte: fte(n),
      }),
      after: $workspace,
    };
    await tick();
    // The row may be gone (fully staffed): the toast's undo is the natural next stop.
    undoButton?.focus();
  }

  function closeDialog() {
    dialogFor = null;
    const back = returnTo;
    returnTo = null;
    void tick().then(() => {
      if (document.activeElement === document.body || document.activeElement === null)
        (back?.isConnected ? back : undoButton)?.focus();
    });
  }

  function undo() {
    if (!done || $workspace !== done.after) return;
    workspace.undo();
    done = null;
    undone = true;
    // The undo button is gone: continue at the selected person, else at the product search.
    void tick().then(() =>
      (
        root?.querySelector<HTMLElement>(`button.person[aria-pressed="true"]`) ?? productSearch
      )?.focus(),
    );
  }

  // ---------- drag ----------

  function dragStart(e: DragEvent, id: string) {
    dragging = id;
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
  function dragEnd() {
    dragging = null;
    dropTarget = null;
  }
  function dragOver(e: DragEvent, row: OpenDemand) {
    if (dragging === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropTarget = rowKey(row);
  }
  function drop(e: DragEvent, row: OpenDemand) {
    if (dragging === null) return;
    e.preventDefault();
    const id = dragging;
    dragEnd();
    if (isMember(row.team, id)) {
      refused = $t('board.drop.member', { name: personName(id), team: row.team.name });
      return;
    }
    refused = '';
    selectedId = id;
    openDialog(row, id, e.currentTarget as HTMLElement);
  }

  const summary = $derived.by(() => {
    if (productQuery.trim() !== '')
      return demandCount === 0
        ? $t('board.summary.none.search')
        : $t(demandCount === 1 ? 'board.summary.search.one' : 'board.summary.search', {
            n: demandCount,
          });
    if (family)
      return demandCount === 0
        ? $t('board.summary.none', { family: family.name })
        : $t(
            demandCount === 1
              ? 'board.summary.family.one'
              : areaCount === 0
                ? 'board.summary.family.noArea'
                : areaCount === 1
                  ? 'board.summary.family.oneArea'
                  : 'board.summary.family',
            {
              n: demandCount,
              m: areaCount,
              family: family.name,
            },
          );
    return demandCount === 0
      ? $t('board.summary.none.all')
      : $t(
          demandCount === 1
            ? 'board.summary.all.one'
            : areaCount === 0
              ? 'board.summary.all.noArea'
              : areaCount === 1
                ? 'board.summary.all.oneArea'
                : 'board.summary.all',
          {
            n: demandCount,
            m: areaCount,
          },
        );
  });
  const fitsText = $derived(
    selected
      ? totalMatches === 0
        ? $t('board.fits.none', { name: selected.name })
        : $t(totalMatches === 1 ? 'board.fits.one' : 'board.fits.other', {
            n: totalMatches,
            name: selected.name,
          })
      : '',
  );
  const productsText = (n: number) =>
    n === 1 ? $t('board.person.products.one') : $t('board.person.products.other', { n });
</script>

<div class="board" class:dragging={dragging !== null} bind:this={root}>
  <p class="lead">{$t('board.lead', { name: unit.name })}</p>

  <div class="columns">
    <section class="people" aria-labelledby="{uid}-people">
      <h3 id="{uid}-people" class="sr-only">{$t('board.people', { name: unit.name })}</h3>
      <div class="people-head">
        {#if family}<span class="family">{family.name}</span>{/if}
        <span class="muted"
          >{$t(totalFree < 0 ? 'board.people.summary.over' : 'board.people.summary', {
            n: people.length,
            fte: fte(Math.abs(totalFree)),
          })}</span
        >
      </div>
      <label class="sr-only" for="{uid}-pq">{$t('board.searchPerson')}</label>
      <input
        id="{uid}-pq"
        type="search"
        placeholder={$t('board.searchPerson')}
        bind:value={personQuery}
      />
      {#if teamSkills.length > 0}
        <div class="skill-filter" role="group" aria-label={$t('board.skills')}>
          <button
            type="button"
            class="chip-btn"
            aria-pressed={skillFilter === null}
            onclick={() => (skillFilter = null)}>{$t('board.skills.all')}</button
          >
          {#each teamSkills as s (s.id)}
            <button
              type="button"
              class="chip-btn"
              aria-pressed={skillFilter === s.id}
              onclick={() => (skillFilter = skillFilter === s.id ? null : s.id)}>{s.name}</button
            >
          {/each}
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" bind:checked={freeOnly} />
        {$t('board.freeOnly', { n: withFree.length, m: people.length })}
      </label>

      {#if people.length === 0}
        <p class="muted empty">{$t('board.people.empty')}</p>
      {:else if shownPeople.length === 0}
        <p class="muted empty">{$t('board.people.none')}</p>
      {:else}
        <ul class="person-list">
          {#each shownPeople as p (p.person.id)}
            {@const skills = personSkills(ws, p.person)}
            <li>
              <button
                type="button"
                class="person"
                aria-pressed={selectedId === p.person.id}
                aria-describedby={selectedId === p.person.id ? `${uid}-fits` : undefined}
                draggable="true"
                ondragstart={(e) => dragStart(e, p.person.id)}
                ondragend={dragEnd}
                onclick={() => select(p.person.id)}
                data-person={p.person.id}
              >
                <span class="avatar" aria-hidden="true">{initials(p.person.name)}</span>
                <span class="who">
                  <span class="name">{p.person.name}</span>
                  <span class="chips">
                    {#each skills as s (s.id)}<span class="chip">{s.name}</span>{/each}
                    {#if skills.length === 0}<span class="muted small"
                        >{$t('board.person.noSkills')}</span
                      >{/if}
                  </span>
                  <span class="muted small">{productsText(p.products)}</span>
                </span>
                <span class="free" class:over={p.free < 0}>
                  {#if p.free < 0}
                    <span class="num">{$t('board.person.over')}</span>
                    <span class="muted small">{$t('line.fte', { fte: fte(-p.free) })}</span>
                  {:else}
                    <span class="num">{fte(p.free)}</span>
                    <span class="muted small"
                      >{$t('board.person.of', { fte: fte(p.contract) })}</span
                    >
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="demands" aria-labelledby="{uid}-demands">
      <h3 id="{uid}-demands" class="sr-only">{$t('board.demands')}</h3>
      <label class="sr-only" for="{uid}-dq">{$t('board.searchProduct')}</label>
      <input
        id="{uid}-dq"
        type="search"
        placeholder={$t('board.searchProduct')}
        bind:this={productSearch}
        bind:value={productQuery}
      />
      <div class="summary">
        {#if !familyId && productQuery.trim() === ''}
          <p class="muted">{$t('board.noFamily', { name: unit.name })}</p>
        {/if}
        <p class="muted">
          {summary}
          <span id="{uid}-fits" role="status" class="fits">{fitsText}</span>
        </p>
        {#if selected}
          <button type="button" class="link" onclick={() => select(null)}
            >{$t('board.clear')}</button
          >
        {/if}
      </div>

      {#each groups as g, i (groupKey(g))}
        {@const n = matchCount(g, lens)}
        {@const open = isOpen(g, i)}
        <section class="group" aria-labelledby="{uid}-g-{i}">
          <h4 class="group-head">
            <button
              type="button"
              id="{uid}-g-{i}"
              class="group-toggle"
              aria-expanded={open}
              onclick={() => toggleGroup(g, i)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="chev" class:open
                ><path d="M9 6l6 6-6 6" /></svg
              >
              <span class="group-name">{g.area?.name ?? $t('board.group.none')}</span>
              <span class="group-figures"
                >{$t('board.group.open', { n: g.rows.length, fte: fte(g.open) })}</span
              >
              {#if n > 0}<span class="badge"
                  >{$t(n === 1 ? 'board.group.fits.one' : 'board.group.fits', { n })}</span
                >{/if}
            </button>
            {#if g.area}<span class="group-owners"><OwnerAvatars unit={g.area} /></span>{/if}
          </h4>
          {#if open}
            <ul class="rows">
              {#each rowsOf(g, selected) as row (rowKey(row))}
                {@const match = lens ? fits(lens, row.demand) : false}
                {@const min = minCommitment(ws, row.team, row.demand.roleId)}
                {@const member = selected ? isMember(row.team, selected.id) : false}
                <li
                  class="row"
                  class:match
                  class:dim={dragging !== null && !match}
                  class:target={dropTarget === rowKey(row)}
                  ondragover={(e) => dragOver(e, row)}
                  ondragleave={() => dropTarget === rowKey(row) && (dropTarget = null)}
                  ondrop={(e) => drop(e, row)}
                  data-demand={rowKey(row)}
                >
                  <div class="product">
                    <span class="product-name">{row.team.name}</span>
                    <span class="product-meta">
                      <OwnerAvatars unit={row.team} />
                      <span class="muted small"
                        >{$t('team.switcher.meta', {
                          kind: $t('team.cadence.kind.' + row.team.cadence.kind),
                          weeks: row.team.cadence.lengthWeeks,
                        })}</span
                      >
                    </span>
                  </div>
                  <span class="skill" class:role={row.demand.skillId === undefined}
                    >{what(row)}</span
                  >
                  <div class="amounts">
                    <span
                      ><strong class="open-fte">{fte(row.open)}</strong>
                      {$t('board.row.of', { fte: fte(row.demand.fte) })}</span
                    >
                    {#if min}<span class="muted small"
                        >{$t('board.row.min', { fte: fte(min.fte) })}</span
                      >{/if}
                  </div>
                  <div class="staffed">
                    {#if row.who.length > 0}
                      <span
                        class="mini-avatars"
                        role="img"
                        aria-label={$t('board.row.who', {
                          names: row.who.map((w) => personName(w.personId)).join(', '),
                        })}
                      >
                        {#each row.who as w (w.personId)}
                          <span class="mini" title={personName(w.personId)}
                            >{initials(personName(w.personId))}</span
                          >
                        {/each}
                      </span>
                    {/if}
                  </div>
                  <div class="action">
                    {#if selected && member}
                      <span class="muted small"
                        >{$t('board.row.member', { name: selected.name })}</span
                      >
                    {:else if selected}
                      <button
                        type="button"
                        class:primary={match}
                        onclick={(e) => openDialog(row, selected.id, e.currentTarget)}
                        >{$t('board.assignPerson', { name: selected.name })}<span class="sr-only"
                          >{$t('board.row.context', {
                            skill: what(row),
                            team: row.team.name,
                          })}</span
                        ></button
                      >
                    {:else}
                      <button
                        type="button"
                        onclick={(e) => openDialog(row, undefined, e.currentTarget)}
                        >{$t('assign.start')}<span class="sr-only"
                          >{$t('board.row.context', {
                            skill: what(row),
                            team: row.team.name,
                          })}</span
                        ></button
                      >
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </section>
  </div>

  <div class="toast" class:show={done !== null || undone || refused !== ''}>
    <span role="status"
      >{refused !== '' ? refused : done ? done.text : undone ? $t('board.undone') : ''}</span
    >
    {#if done && refused === '' && $workspace === done.after}
      <button type="button" bind:this={undoButton} onclick={undo}>{$t('board.undo')}</button>
    {/if}
  </div>
</div>

{#if dialogFor && dialogTeam && dialogDemand}
  <AssignDialog
    team={dialogTeam}
    demand={dialogDemand}
    person={dialogFor.personId}
    onclose={closeDialog}
    onassigned={assigned}
  />
{/if}

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-width: 0;
  }
  .lead {
    margin: 0;
    max-width: 70ch;
    color: var(--text-muted);
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(17rem, 22rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 56rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.8rem;
  }
  .people {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
    min-width: 0;
  }
  @media (min-width: 56.01rem) {
    .people {
      position: sticky;
      top: 0.75rem;
      max-height: calc(100dvh - 1.5rem);
    }
    .person-list {
      overflow-y: auto;
    }
  }
  @media (max-width: 56rem) {
    .person-list {
      max-height: 26rem;
      overflow-y: auto;
    }
  }
  .people-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    font-size: 0.9rem;
  }
  .family {
    padding: 0.1rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--line);
    font-weight: 650;
  }
  .skill-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  :global(#app) .board button.chip-btn {
    min-height: 2rem;
    padding: 0.15rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: none;
    font-size: 0.85rem;
    font-weight: 550;
  }
  :global(#app) .board button.chip-btn[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--line-soft);
    color: var(--line);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .empty {
    margin: 0.25rem 0;
  }
  .person-list {
    list-style: none;
    margin: 0 -0.35rem;
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border-top: 1px solid var(--border);
  }
  :global(#app) .board button.person {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.6rem;
    align-items: start;
    width: 100%;
    padding: 0.6rem 0.65rem;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    box-shadow: none;
    text-align: start;
    font-weight: 500;
    cursor: grab;
  }
  :global(#app) .board button.person:hover {
    background: var(--surface-2);
  }
  :global(#app) .board button.person[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .name {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.8rem;
  }
  .free {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: end;
    white-space: nowrap;
  }
  .free .num {
    font-weight: 750;
    font-size: 1.05rem;
    color: var(--ok);
    font-variant-numeric: tabular-nums;
  }
  .free.over .num {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .demands {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }
  .summary p {
    margin: 0;
  }
  .fits {
    color: var(--line);
    font-weight: 650;
  }
  :global(#app) .board button.link {
    padding: 0.2rem 0.3rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--accent-text);
    text-decoration: underline;
  }
  .group {
    border: 1px solid var(--border);
    border-left: 3px solid var(--area);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
    overflow: hidden;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding-inline-end: 0.75rem;
    font-size: 1rem;
  }
  :global(#app) .board button.group-toggle {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    min-height: 3rem;
    padding: 0.6rem 0.75rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    text-align: start;
    font-size: 1rem;
  }
  .chev {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    transition: transform 0.15s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .group-name {
    color: var(--area);
    font-weight: 700;
  }
  .group-figures {
    margin-inline-start: auto;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.8rem;
    font-weight: 650;
  }
  /* One column grid for all rows of a platform, so skill and amounts line up (subgrid). */
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns:
      minmax(7rem, 1fr) max-content max-content minmax(0, max-content)
      max-content;
  }
  .row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    gap: 0.4rem 0.9rem;
    align-items: center;
    padding: 0.65rem 0.9rem;
    border-top: 1px solid var(--border);
    transition:
      background-color 0.15s,
      opacity 0.15s;
  }
  .row.match {
    background: var(--line-soft);
  }
  .row.dim {
    opacity: 0.45;
  }
  .row.target {
    outline: 2px dashed var(--accent);
    outline-offset: -3px;
  }
  @media (max-width: 40rem) {
    .rows {
      display: block;
    }
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .row .skill,
    .row .amounts {
      grid-column: 1 / -1;
    }
    .row .product {
      grid-column: 1;
    }
    .row .staffed {
      grid-row: 1;
      grid-column: 2;
    }
    .row .action {
      grid-column: 1 / -1;
    }
    .row .action button {
      width: 100%;
    }
  }
  .product {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .product-name {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .product-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .skill {
    justify-self: start;
    max-width: 14rem;
    padding: 0.15rem 0.6rem;
    border-radius: 0.8rem;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--line);
    font-weight: 650;
    font-size: 0.9rem;
  }
  .skill.role {
    border-color: var(--border-strong);
    color: var(--text);
    font-weight: 550;
  }
  .amounts {
    white-space: nowrap;
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .open-fte {
    color: var(--warn);
  }
  .mini-avatars {
    display: inline-flex;
    gap: 0.15rem;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.65rem;
    font-weight: 700;
  }
  .action {
    justify-self: end;
  }
  .toast:not(.show) {
    display: none;
  }
  .toast {
    position: fixed;
    inset-inline: 0;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    z-index: 20;
    width: fit-content;
    max-width: calc(100vw - 2rem);
    margin-inline: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    padding: 0.6rem 0.75rem 0.6rem 1rem;
    border-radius: var(--radius-lg);
    background: var(--text);
    color: var(--bg);
    box-shadow: var(--shadow-lg);
  }
  :global(#app) .board .toast button {
    border-color: transparent;
    background: transparent;
    color: var(--bg);
    font-weight: 700;
    text-decoration: underline;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .row,
    .chev {
      transition: none;
    }
  }
</style>
