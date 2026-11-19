<script lang="ts">
  import { areaOf, orgName, type Area, type Cadence, type Team } from '../../core/model';
  import { levels, translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import AreaIcon from '../components/AreaIcon.svelte';
  import OrgIcon from '../components/OrgIcon.svelte';
  import OwnerAvatars from '../components/OwnerAvatars.svelte';
  import { hasOwnerRoles, ownerGaps } from '../../core/owners';
  import { workspace } from '../state/workspace';

  /**
   * The organisation's page (#313): the tree organisation → areas → teams. It only shows; a click
   * on a card opens that area or team, where it is edited.
   */
  let { onOpen }: { onOpen: (unitId: string) => void } = $props();

  const ws = $derived($workspace);
  const name = $derived(orgName(ws, $levels.org));
  const ungrouped = $derived(ws.teams.filter((x) => !areaOf(ws, x.id)));
  const teamsOf = (ids: string[]): Team[] => ws.teams.filter((x) => ids.includes(x.id));

  /** People with a role in the given units, each once. */
  function peopleIn(units: { members: { personId: string }[] }[]): number {
    return new Set(units.flatMap((u) => u.members.map((m) => m.personId))).size;
  }
  /** Missing wanted owners of a platform and its products (#331). */
  const gapsIn = (area: Area, teams: Team[]) =>
    [area, ...teams].reduce((n, u) => n + ownerGaps(ws, u), 0);
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
      peopleText(peopleIn([...ws.teams, ...ws.areas])),
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
        <OwnerAvatars unit={team} />
      </span>
    </button>
  </li>
{/snippet}

<div class="org-view">
  <p class="subtitle">{$t('org.subtitle')}</p>
  <ul class="tree" aria-label={$t('org.tree.label', { name })}>
    <li class="root-item">
      <div class="node root">
        <span class="badge" aria-hidden="true"><OrgIcon /></span>
        <span class="text">
          <span class="title">{name}</span>
          <span class="meta">{$levels.org} · {total}</span>
        </span>
      </div>
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
                {#if hasOwnerRoles(ws)}<span class="owners-row">
                    <OwnerAvatars unit={area} names />
                    {#if gapsIn(area, teams) > 0}
                      <span class="gaps"
                        >{$t(gapsIn(area, teams) === 1 ? 'owner.gaps.one' : 'owner.gaps.other', {
                          n: gapsIn(area, teams),
                        })}</span
                      >
                    {/if}
                  </span>{/if}
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
</div>

<style>
  .owners-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.75rem;
    margin-top: 0.35rem;
  }
  .gaps {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 0.8rem;
    font-weight: 600;
  }
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
  /* Organisation on top, a stem down to the row of areas. */
  .node.root {
    position: relative;
    width: auto;
    min-width: min(22rem, 100%);
    max-width: 36rem;
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
