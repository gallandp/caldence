<script lang="ts">
  import { loadPerWeek } from '../../core/load';
  import {
    childUnits,
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
   */
  let {
    root,
    rows,
    onOpen,
  }: { root: LineUnit; rows?: StaffRow[]; onOpen: (selection: string) => void } = $props();

  const ws = $derived($workspace);
  const allRows = $derived.by(() => {
    if (rows) return rows;
    const weeks = loadPerWeek(ws, $index);
    return staffRows(ws, root.id, weeks, overLimitPeople(weeks, ws));
  });
  const byPerson = $derived(new Map(allRows.map((r) => [r.person.id, r])));
  const kids = (id: string) => childUnits(ws, id);

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
  const meta = (u: LineUnit, group: boolean) => {
    const manager = managerOf(u);
    return [
      group ? $levels.lineGroup : $levels.lineTeam,
      manager ? $t('line.tile.manager', { name: manager }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  /** Line units below the root, at any depth. */
  const below = $derived.by(() => {
    let n = 0;
    const walk = (id: string) => {
      for (const k of kids(id)) {
        n++;
        walk(k.id);
      }
    };
    walk(root.id);
    return n;
  });
  const rootStats = $derived(stats(root.id));
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

{#snippet node(u: LineUnit)}
  {@const group = kids(u.id).length > 0}
  <button
    type="button"
    class="node"
    class:group
    data-line-node={u.id}
    onclick={() => onOpen(lineSelection(u.id))}
  >
    <span class="badge" aria-hidden="true">
      {#if group}<svg viewBox="0 0 24 24"><path d={LINE_ICON} /></svg>{:else}{initials(u.name)}{/if}
    </span>
    <span class="text">
      <span class="title">{u.name}</span>
      <span class="meta">{meta(u, group)}</span>
      {@render figures(stats(u.id))}
    </span>
  </button>
{/snippet}

{#snippet branch(id: string)}
  <ul class="kids">
    {#each kids(id) as k (k.id)}
      <li>
        {@render node(k)}
        {#if kids(k.id).length > 0}{@render branch(k.id)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<ul class="tree" aria-label={$t('line.tree.label', { name: root.name })}>
  <li class="root-item">
    <div class="node root">
      <span class="badge" aria-hidden="true"
        ><svg viewBox="0 0 24 24"><path d={LINE_ICON} /></svg></span
      >
      <span class="text">
        <span class="title">{root.name}</span>
        <span class="meta"
          >{[$levels.lineGroup, unitsText(below)].join(' · ')}{managerOf(root)
            ? ' · ' + $t('line.tile.manager', { name: managerOf(root) ?? '' })
            : ''}</span
        >
        {@render figures(rootStats)}
      </span>
    </div>
    <ul class="columns">
      {#each kids(root.id) as k (k.id)}
        <li class="column">
          {@render node(k)}
          {#if kids(k.id).length > 0}{@render branch(k.id)}{/if}
        </li>
      {/each}
    </ul>
  </li>
</ul>

<style>
  .tree {
    --stem: color-mix(in srgb, var(--line) 35%, var(--border));
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
  .node.root::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    height: 1.25rem;
    border-left: 2px solid var(--stem);
  }
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr));
    gap: 1.5rem 1rem;
    width: 100%;
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 2px solid var(--stem);
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
    border-left: 2px solid var(--stem);
  }
  .kids > li {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
