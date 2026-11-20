<script lang="ts">
  import { tick } from 'svelte';
  import { areaOf, orgArea, orgName, type Area, type Cadence, type Team } from '../../core/model';
  import { areaStructure } from '../../core/structure';
  import { levels, locale, translate as t } from '../../i18n';
  import { initials, inkOn } from '../avatar';
  import AreaIcon from '../components/AreaIcon.svelte';
  import AreaPersonAdd from '../components/AreaPersonAdd.svelte';
  import AreaPersonCard from '../components/AreaPersonCard.svelte';
  import OrgIcon from '../components/OrgIcon.svelte';
  import AreaOverview from './AreaOverview.svelte';
  import { presenting } from '../state/present';
  import { structurePerson } from '../state/view';
  import { workspace } from '../state/workspace';

  /**
   * The organisation's page (#313): the tree organisation → areas → teams. A click on a card
   * opens that area or team, where it is edited. The organisation's own people (#328) are added
   * and edited here with the dialogs of an area's structure. Above the tree the area Overview's
   * alignment, load and cost figures for all teams, below it the cost per team (#450).
   */
  let {
    onOpen,
    onOpenUnit,
  }: {
    onOpen: (unitId: string) => void;
    /** Opens Meetings & cadence of a team, an area or the organisation. */
    onOpenUnit?: (unitId: string) => void;
  } = $props();

  const ws = $derived($workspace);
  const name = $derived(orgName(ws, $levels.org));

  // ---------- the organisation's own people (#328) ----------

  /**
   * The organisation as an area for the area dialogs, under its display name; inside their
   * sentences an unnamed one is "the organisation" ("Add a person to the organisation").
   */
  const org = $derived({ ...orgArea(ws), name });
  const inSentence = $derived(orgName(ws, $levels.orgThe));
  const structure = $derived(areaStructure(ws, org));
  /** People with a role or hours in the organisation; those only invited stay in the meetings. */
  const own = $derived(structure.people.filter((p) => p.areaRoleIds.length > 0 || p.areaHours > 0));
  /**
   * Invited through "every area", "every team" or by name, without hours here (#436): their
   * hours are set here.
   */
  const invited = $derived(structure.people.filter((p) => p.invitedOnly));
  const byId = $derived(new Map(structure.people.map((p) => [p.personId, p])));
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const roleOf = (id: string | undefined) => ws.roles.find((r) => r.id === id);
  const hours = (n: number) =>
    `${new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(n)} h`;

  let selected = $state<string | null>(null);
  let card: AreaPersonCard | undefined = $state();
  let adder: AreaPersonAdd | undefined = $state();
  let addButton: HTMLButtonElement | undefined = $state();
  let peopleList: HTMLUListElement | undefined = $state();
  let ownBox: HTMLDivElement | undefined = $state();

  function pick(personId: string, event: Event, focusHours = false) {
    if (selected === personId && !focusHours) {
      selected = null;
      return;
    }
    selected = personId;
    void card?.open(event.currentTarget as HTMLElement, focusHours);
  }

  /**
   * "Set hours" elsewhere (#361) opens the person's card at their hours here, also for someone
   * only invited, who has no tile of their own.
   */
  $effect(() => {
    const target = $structurePerson;
    if (!target || target.areaId !== org.id) return;
    structurePerson.set(undefined);
    const id = target.personId;
    void tick().then(() => {
      const from = ownBox?.querySelector<HTMLElement>(`[data-p="${CSS.escape(id)}"]`) ?? addButton;
      if (!from || !byId.has(id)) return;
      from.scrollIntoView({ block: 'center' });
      selected = id;
      void card?.open(from, true);
    });
  });

  /** After adding: the new person's tile gets the focus. */
  async function focusPerson(personId: string) {
    await tick();
    peopleList?.querySelector<HTMLElement>(`[data-p="${CSS.escape(personId)}"]`)?.focus();
  }
  const ungrouped = $derived(ws.teams.filter((x) => !areaOf(ws, x.id)));
  const teamsOf = (ids: string[]): Team[] => ws.teams.filter((x) => ids.includes(x.id));

  /** People with a role in the given units, each once. */
  function peopleIn(units: { members: { personId: string }[] }[]): number {
    return new Set(units.flatMap((u) => u.members.map((m) => m.personId))).size;
  }
  const peopleText = (n: number) => $t(n === 1 ? 'org.people.one' : 'org.people.other', { n });
  const teamsText = (n: number) => $t(n === 1 ? 'area.count.one' : 'area.count.other', { n });
  const cadenceText = (c: Cadence) =>
    $t('team.switcher.meta', { kind: $t('team.cadence.kind.' + c.kind), weeks: c.lengthWeeks });

  const areaMeta = (area: Area, teams: Team[]) =>
    [
      $levels.area,
      area.cadence ? cadenceText(area.cadence) : '',
      teamsText(teams.length),
      peopleText(peopleIn([area, ...teams])),
    ]
      .filter(Boolean)
      .join(' · ');

  const total = $derived(
    [
      ws.areas.length > 0
        ? $t(ws.areas.length === 1 ? 'org.count.areas.one' : 'org.count.areas.other', {
            n: ws.areas.length,
          })
        : '',
      teamsText(ws.teams.length),
      peopleText(peopleIn([...ws.teams, ...ws.areas, org])),
    ]
      .filter(Boolean)
      .join(' · '),
  );
</script>

{#snippet teamCard(team: Team)}
  <li>
    <button type="button" class="node team" onclick={() => onOpen(team.id)}>
      <span class="badge" aria-hidden="true">{initials(team.name)}</span>
      <span class="text">
        <span class="title">{team.name}</span>
        <span class="meta">{cadenceText(team.cadence)} · {peopleText(peopleIn([team]))}</span>
      </span>
    </button>
  </li>
{/snippet}

<div class="org-view structure">
  <p class="subtitle">{$t('org.subtitle')}</p>
  <AreaOverview area={org} summary {onOpenUnit}>
    <ul class="tree" aria-label={$t('org.tree.label', { name })}>
      <li class="root-item">
        <section class="node root" aria-labelledby="org-root-name">
          <div class="root-head">
            <span class="badge" aria-hidden="true"><OrgIcon /></span>
            <span class="text">
              <span class="title" id="org-root-name">{name}</span>
              <span class="meta">{$levels.org} · {total}</span>
            </span>
            <button
              type="button"
              class="secondary add"
              data-no-present
              bind:this={addButton}
              onclick={() => adder?.show(addButton)}>{$t('area.structure.add')}</button
            >
          </div>
          <div class="own" bind:this={ownBox}>
            <h3 class="cap">{$t('org.people.title')} <span class="n">· {own.length}</span></h3>
            {#if own.length > 0}
              <ul class="people" bind:this={peopleList}>
                {#each own as p (p.personId)}
                  {@const c =
                    roleOf(p.areaRoleIds[0] ?? p.teams[0]?.roleIds[0])?.colour ?? '#5340e6'}
                  <li>
                    <button
                      type="button"
                      class="person"
                      class:sel={selected === p.personId}
                      data-p={p.personId}
                      aria-pressed={selected === p.personId}
                      onclick={(e) => pick(p.personId, e)}
                    >
                      <span
                        class="av"
                        style:background={c}
                        style:color={inkOn(c)}
                        aria-hidden="true">{initials(personName(p.personId))}</span
                      >
                      <span class="tx"
                        ><b>{personName(p.personId)}</b><small
                          >{p.areaRoleIds.map((id) => roleOf(id)?.name ?? id).join(', ')}</small
                        ></span
                      >
                      <span class="h">{hours(p.areaHours)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {:else if invited.length === 0}
              <p class="none">{$t('org.people.none')}</p>
            {/if}
            {#if invited.length > 0}
              <div class="invited" data-org-invited>
                <h4 class="lbl" id="org-invited">{$t('org.invited')} · {invited.length}</h4>
                <ul class="chips" aria-labelledby="org-invited">
                  {#each invited as p (p.personId)}
                    <li>
                      {#if $presenting}
                        <span class="chip">{personName(p.personId)}</span>
                      {:else}
                        <button
                          type="button"
                          class="chip"
                          data-p={p.personId}
                          aria-label={$t('load.hint.setHours', {
                            person: personName(p.personId),
                            area: inSentence,
                          })}
                          onclick={(e) => pick(p.personId, e, true)}
                          >{personName(p.personId)}</button
                        >
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </section>
        {#if ws.areas.length === 0}
          <p class="hint">{$t('org.noAreas')}</p>
        {/if}
        <ul class="columns">
          {#each ws.areas as area (area.id)}
            {@const teams = teamsOf(area.teamIds)}
            <li class="column">
              <button type="button" class="node area" onclick={() => onOpen(area.id)}>
                <span class="badge" aria-hidden="true"><AreaIcon /></span>
                <span class="text">
                  <span class="title">{area.name}</span>
                  <span class="meta">{areaMeta(area, teams)}</span>
                </span>
              </button>
              {#if teams.length > 0}
                <ul class="kids">
                  {#each teams as team (team.id)}{@render teamCard(team)}{/each}
                </ul>
              {:else}
                <p class="empty">{$t('org.emptyArea')}</p>
              {/if}
            </li>
          {/each}
          {#if ungrouped.length > 0}
            <li class="column loose">
              <p class="group">{$t('area.ungrouped')}</p>
              <ul class="kids">
                {#each ungrouped as team (team.id)}{@render teamCard(team)}{/each}
              </ul>
            </li>
          {/if}
        </ul>
      </li>
    </ul>
  </AreaOverview>
</div>

<AreaPersonCard
  bind:this={card}
  area={org}
  {inSentence}
  personId={selected}
  person={selected ? byId.get(selected) : undefined}
  onclose={() => (selected = null)}
  ongone={() => addButton?.focus()}
/>
<AreaPersonAdd bind:this={adder} area={org} {inSentence} onadded={focusPerson} />

<style>
  .org-view {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }
  .subtitle {
    margin: -0.5rem 0 0;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .root-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* Organisation on top, with its own people, and a stem down to the row of areas. */
  .node.root {
    position: relative;
    flex-direction: column;
    align-items: stretch;
    width: min(36rem, 100%);
    border-color: color-mix(in srgb, var(--org) 45%, var(--border));
    background: linear-gradient(180deg, var(--org-soft), var(--surface) 140%);
  }
  .node.root::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    height: 1.25rem;
    border-left: 2px solid var(--area-line);
  }
  .root-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .root-head .text {
    flex: 1;
  }
  .own {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-top: 0.6rem;
    border-top: 1px solid color-mix(in srgb, var(--org) 25%, var(--border));
  }
  :global(#app) .own .cap {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .cap .n {
    font-weight: 400;
  }
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.25rem;
  }
  :global(#app) .person {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.375rem 0.5rem;
    border-color: transparent;
    border-radius: 0.625rem;
    background: none;
    box-shadow: none;
    color: var(--text);
    font-weight: 400;
    text-align: start;
  }
  :global(#app) .person:hover {
    background: var(--surface-2);
  }
  :global(#app) .person.sel {
    border-color: var(--org);
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--org);
  }
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
  .tx {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .tx b,
  .tx small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tx b {
    font-weight: 600;
  }
  .tx small,
  .h,
  .none {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .invited {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }
  :global(#app) .invited .lbl {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--warn);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  :global(#app) .invited button.chip {
    min-width: 0;
    min-height: 0;
    border: 0;
    box-shadow: none;
    background: var(--accent-soft);
    color: var(--accent-text);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
  }
  :global(#app) .invited button.chip:hover {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  .h {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .none {
    margin: 0;
  }
  .hint {
    max-width: 36rem;
    margin: 1.75rem 0 0;
    color: var(--text-muted);
    text-align: center;
  }
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1.5rem 1rem;
    width: 100%;
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 2px solid var(--area-line);
  }
  /* A short stem from the line of areas down to each column. */
  .column {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .column::before {
    content: '';
    position: absolute;
    left: 2.025rem;
    top: -1.25rem;
    height: 1.25rem;
    border-left: 2px solid var(--area-line);
  }
  .kids {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-left: 1.1rem;
    padding-left: 0.9rem;
  }
  .kids::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 1.4rem;
    border-left: 2px solid var(--area-line);
  }
  .column.loose .kids {
    margin-left: 0;
    padding-left: 0;
  }
  .column.loose .kids::before {
    content: none;
  }
  .node {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
    text-align: start;
    box-sizing: border-box;
  }
  :global(#app) button.node {
    justify-content: flex-start;
    min-height: 3.5rem;
    font-weight: 400;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  :global(#app) button.node:hover {
    background: var(--surface);
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  :global(#app) button.node.area {
    border-color: color-mix(in srgb, var(--area) 35%, var(--border));
    background: linear-gradient(180deg, var(--area-soft), var(--surface) 160%);
  }
  :global(#app) button.node.area:hover {
    border-color: var(--area);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.65rem;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 700;
    background: linear-gradient(135deg, #7b6bff, #5340e6);
  }
  .root .badge {
    width: 2.75rem;
    height: 2.75rem;
    font-size: 1.35rem;
    background: linear-gradient(135deg, #3b82f6, #1e3a8a);
  }
  .area .badge {
    font-size: 1.1rem;
    background: linear-gradient(135deg, #14b8a6, #22c3ee);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .title {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .root .title {
    font-size: 1.15rem;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .group,
  .empty {
    margin: 0;
    padding: 0.4rem 0.2rem;
    color: var(--text-muted);
  }
  .group {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(#app) button.node {
      transition: none;
    }
    :global(#app) button.node:hover {
      transform: none;
    }
  }
  @media (forced-colors: active) {
    .node.root::after,
    .column::before,
    .columns,
    .kids::before {
      border-color: CanvasText;
    }
  }
</style>
