<script lang="ts">
  import { loadPerWeek } from '../../core/load';
  import {
    overLimitPeople,
    staffRows,
    unitStats,
    type StaffRow,
    type UnitStats,
  } from '../../core/lineStaff';
  import { lineSelection, linePeople, type LineUnit } from '../../core/model';
  import { formatNumber, levels, locale, translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import { presenting } from '../state/present';
  import { index, workspace } from '../state/workspace';
  import { LINE_ICON } from '../viewIcons';

  /**
   * The line organisation as a tree (#390), like the organisation's and an area's structure:
   * `root` on top, its sub-units as columns, deeper units nested below. Every node shows its
   * people, free FTE and hints; a click opens that unit. Self-contained (it only needs a root
   * unit), so it can stand on any page; `rows` saves recomputing them when the page has them.
   * On the root's own page (`rootIsPage`) the root is a plain heading card, elsewhere it opens too.
   */
  let {
    root,
    rows,
    onOpen,
    rootIsPage = true,
  }: {
    root: LineUnit;
    rows?: StaffRow[];
    onOpen: (selection: string) => void;
    rootIsPage?: boolean;
  } = $props();

  const ws = $derived($workspace);
  const allRows = $derived.by(() => {
    if (rows) return rows;
    const weeks = loadPerWeek(ws, $index);
    return staffRows(ws, root.id, weeks, overLimitPeople(weeks, ws));
  });
  const byPerson = $derived(new Map(allRows.map((r) => [r.person.id, r])));
  /** Sub-units per parent, built once per workspace. */
  const children = $derived.by(() => {
    const out: Record<string, LineUnit[]> = {};
    for (const u of ws.lineUnits ?? []) if (u.parentId) (out[u.parentId] ??= []).push(u);
    return out;
  });
  const kids = (id: string): LineUnit[] => children[id] ?? [];

  /** A unit's figures over all its people, sub-units included. */
  function stats(id: string): UnitStats {
    const own: StaffRow[] = [];
    for (const pid of linePeople(ws, id)) {
      const r = byPerson.get(pid);
      if (r) own.push(r);
    }
    return unitStats(own);
  }

  const fte = (n: number) => formatNumber($locale, n, 1);
  const peopleText = (n: number) => $t(n === 1 ? 'org.people.one' : 'org.people.other', { n });
  const unitsText = (n: number) =>
    $t(n === 1 ? 'line.tree.units.one' : 'line.tree.units.other', { n });
  const managerOf = (u: LineUnit) =>
    $presenting ? undefined : ws.people.find((p) => p.id === u.managerPersonId)?.name;
  /** Line units below a unit, at any depth. */
  const countBelow = (id: string): number => kids(id).reduce((n, k) => n + 1 + countBelow(k.id), 0);
  const meta = (u: LineUnit, group: boolean, withCount = false) => {
    const manager = managerOf(u);
    return [
      group ? $levels.lineGroup : $levels.lineTeam,
      withCount && group ? unitsText(countBelow(u.id)) : '',
      manager ? $t('line.tile.manager', { name: manager }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
</script>

{#snippet figures(s: UnitStats)}
  <span class="figures">
    <span>{peopleText(s.people)}</span>
    <span class:bad={s.free < 0}
      >{s.free < 0 ? $t('line.overbooked') : $t('line.free', { fte: fte(s.free) })}</span
    >
    {#if s.hinted > 0}
      <span class="hint-count"
        >{$t(s.hinted === 1 ? 'line.hinted.one' : 'line.hinted.other', { n: s.hinted })}</span
      >
    {/if}
  </span>
{/snippet}

{#snippet content(u: LineUnit, group: boolean, isRoot: boolean)}
  <span class="badge" aria-hidden="true">
    {#if group}<svg viewBox="0 0 24 24"><path d={LINE_ICON} /></svg>{:else}{initials(u.name)}{/if}
  </span>
  <span class="text">
    <span class="title">{u.name}</span>
    <span class="meta">{meta(u, group, isRoot)}</span>
    {@render figures(stats(u.id))}
  </span>
{/snippet}

{#snippet node(u: LineUnit, isRoot = false)}
  {@const group = kids(u.id).length > 0}
  {#if isRoot && rootIsPage}
    <div class="node root" class:group>{@render content(u, group, true)}</div>
  {:else}
    <button
      type="button"
      class="node"
      class:root={isRoot}
      class:group
      data-line-node={u.id}
      onclick={() => onOpen(lineSelection(u.id))}>{@render content(u, group, isRoot)}</button
    >
  {/if}
{/snippet}

{#snippet branch(id: string, cls: string)}
  <ul class={cls}>
    {#each kids(id) as k (k.id)}
      <li class:column={cls === 'columns'}>
        {@render node(k)}
        {#if kids(k.id).length > 0}{@render branch(k.id, 'kids')}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<ul class="tree" aria-label={$t('line.tree.label', { name: root.name })}>
  <li class="root-item">
    {@render node(root, true)}
    {#if kids(root.id).length > 0}{@render branch(root.id, 'columns')}{/if}
  </li>
</ul>

<style>
  .tree {
    --stem: color-mix(in srgb, var(--line) 35%, var(--border));
    --col-gap: 1rem;
    container-type: inline-size;
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
  /* The root on top, a stem down to the row of sub-units. */
  .node.root {
    position: relative;
    width: auto;
    min-width: min(22rem, 100%);
    max-width: 36rem;
    border-color: color-mix(in srgb, var(--line) 45%, var(--border));
    background: linear-gradient(180deg, var(--line-soft), var(--surface) 140%);
  }
  .node.root:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    height: 1.25rem;
    border-left: 2px solid var(--stem);
  }
  /* One row of sub-units; it scrolls sideways rather than wrapping into loose rows. */
  .columns {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(12.5rem, 1fr);
    gap: var(--col-gap);
    width: 100%;
    margin-top: 1.25rem;
    padding: 1.25rem 0 0.25rem;
    overflow-x: auto;
  }
  /* A short stem from the line of sub-units down to each column. */
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
    border-left: 2px solid var(--stem);
  }
  /* The bar joining the stems runs from the first column's stem to the last one's, no further. */
  .column:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 2.025rem;
    top: -1.25rem;
    width: calc(100% + var(--col-gap));
    border-top: 2px solid var(--stem);
  }
  .kids {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-left: 1.1rem;
    padding-left: 0.9rem;
  }
  .kids > li {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  /* The trunk of a branch: from the parent card down past every sibling but the last … */
  .kids > li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: -0.9rem;
    top: 0;
    bottom: -0.5rem;
    border-left: 2px solid var(--stem);
  }
  /* … and to each card's middle, with a short arm into the card. */
  .kids > li > .node {
    position: relative;
  }
  .kids > li > .node::before {
    content: '';
    position: absolute;
    left: calc(-0.9rem - 1px);
    top: -0.5rem;
    width: 0.9rem;
    height: calc(50% + 0.5rem);
    border-left: 2px solid var(--stem);
    border-bottom: 2px solid var(--stem);
    border-bottom-left-radius: 0.5rem;
    pointer-events: none;
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
  :global(#app) .tree button.node {
    justify-content: flex-start;
    min-height: 3.5rem;
    font-weight: 400;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  :global(#app) .tree button.node:hover {
    background: var(--surface);
    border-color: var(--line);
    transform: translateY(-1px);
  }
  :global(#app) .tree button.node.group {
    border-color: color-mix(in srgb, var(--line) 30%, var(--border));
    background: linear-gradient(180deg, var(--line-soft), var(--surface) 160%);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.65rem;
    color: var(--line);
    background: var(--line-soft);
    border: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .group .badge,
  .root .badge {
    color: #fff;
    border: 0;
    background: linear-gradient(135deg, #d0488a, #8c1d52);
  }
  .root .badge {
    width: 2.75rem;
    height: 2.75rem;
  }
  .badge svg {
    width: 1.2rem;
    height: 1.2rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
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
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.6rem;
    margin-top: 0.15rem;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .bad {
    color: var(--danger);
    font-weight: 600;
  }
  .hint-count {
    padding: 0 0.45rem;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-weight: 600;
  }
  /* Narrow: the sub-units stack under the root as one branch, joined like the deeper ones. */
  @container (max-width: 36rem) {
    .root-item {
      align-items: stretch;
    }
    .node.root:not(:last-child)::after {
      left: 1.1rem;
      height: 0.75rem;
    }
    .columns {
      grid-auto-flow: row;
      grid-auto-columns: auto;
      gap: 0.75rem;
      margin: 0.75rem 0 0 1.1rem;
      padding: 0 0 0 0.9rem;
      width: auto;
      grid-template-columns: minmax(0, 1fr);
      overflow: visible;
    }
    .column::before {
      content: none;
    }
    .column:not(:last-child)::after {
      left: -0.9rem;
      top: 0;
      bottom: -0.75rem;
      width: 0;
      border-top: 0;
      border-left: 2px solid var(--stem);
    }
    .column > .node {
      position: relative;
    }
    .column > .node::before {
      content: '';
      position: absolute;
      left: calc(-0.9rem - 1px);
      top: -0.75rem;
      width: 0.9rem;
      height: calc(50% + 0.75rem);
      border-left: 2px solid var(--stem);
      border-bottom: 2px solid var(--stem);
      border-bottom-left-radius: 0.5rem;
      pointer-events: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(#app) .tree button.node {
      transition: none;
    }
    :global(#app) .tree button.node:hover {
      transform: none;
    }
  }
  @media (forced-colors: active) {
    .tree {
      --stem: CanvasText;
    }
  }
</style>
