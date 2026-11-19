<script lang="ts" module>
  import { hasLine } from '../../core/model';
  import { SvelteMap } from 'svelte/reactivity';

  /** Platforms the person opened or closed, kept while the app is open. */
  const toggled = new SvelteMap<string, boolean>();
</script>

<script lang="ts">
  import { loadPerWeek } from '../../core/load';
  import type { Cadence, Team } from '../../core/model';
  import {
    OPEN_EPS,
    overLimitCount,
    productMatches,
    staffingMap,
    type MapFilter,
    type PlatformStaffing,
    type ProductStaffing,
    type StatusFilter,
  } from '../../core/staffingMap';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { presenting } from '../state/present';
  import { index, workspace } from '../state/workspace';
  import OwnerAvatars from './OwnerAvatars.svelte';
  import { supplyingUnits } from '../../core/lineStaff';
  import { openPlace } from '../state/jump';

  /**
   * The staffing map (#322): one row per platform, one tile per product, with coverage, open FTE
   * and hints. Counts only: no names of line staff, and in present mode no owners either.
   */
  interface Props {
    /** The products shown: all of the organisation, or one platform's. */
    teams: Team[];
    /** One platform: its row is always open and the skill family filter is left out. */
    single?: boolean;
    /** Opens a product's page. */
    onOpen: (teamId: string) => void;
  }
  let { teams, single = false, onOpen }: Props = $props();
  /** Cross links into the line (#397), while the file has a line. */
  const withLine = $derived(hasLine($workspace));
  const fromLine = (teamId: string) =>
    supplyingUnits(ws, teamId)
      .map((u) => u.name)
      .join(', ');

  const uid = $props.id();
  /** Row key of the products in no platform. */
  const LOOSE = '@loose';
  const ws = $derived($workspace);
  const map = $derived(staffingMap(ws, teams));
  const over = $derived(overLimitCount(ws, map, loadPerWeek(ws, $index)));
  const totals = $derived(map.totals);

  let query = $state('');
  let familyId = $state<string | undefined>(undefined);
  let status = $state<StatusFilter>('all');
  const families = $derived(
    (ws.skillFamilies ?? []).filter((f) =>
      map.platforms.some((p) => p.area?.skillFamilyId === f.id),
    ),
  );
  /** A family that left the map (another file, a change) no longer filters. */
  const family = $derived(families.some((f) => f.id === familyId) ? familyId : undefined);
  const filter: MapFilter = $derived({ query, familyId: family, status });
  const filtering = $derived(query.trim() !== '' || family !== undefined || status !== 'all');

  const rows = $derived(
    map.platforms.map((pl) => {
      const match = new Set(
        pl.products.filter((p) => productMatches(ws, pl, p, filter)).map((p) => p.team.id),
      );
      // A platform missing its own owner has a hint even when none of its products has one.
      const own =
        status === 'hint' &&
        pl.ownerGaps > pl.products.reduce((n, p) => n + p.ownerGaps, 0) &&
        pl.products.some((p) => productMatches(ws, pl, p, { ...filter, status: 'all' }));
      return { pl, match, key: pl.area?.id ?? LOOSE, shown: match.size > 0 || own };
    }),
  );
  const visible = $derived(rows.filter((r) => r.shown));
  const hidden = $derived(rows.length - visible.length);

  /** Platforms start closed on the organisation's map, open on one platform's. */
  /** Closed by default, open while a filter is on, so its matches show; a click decides. */
  const isOpen = (key: string): boolean => single || (toggled.get(key) ?? filtering);
  const toggle = (key: string) => toggled.set(key, !isOpen(key));
  const allOpen = $derived(visible.length > 0 && visible.every((r) => isOpen(r.key)));
  function toggleAll() {
    const open = !allOpen;
    for (const r of visible) toggled.set(r.key, open);
  }

  const fte = (n: number) => formatNumber($locale, n, 1);
  const percent = (n: number) => formatPercent($locale, n);
  const cadenceText = (c: Cadence | undefined) =>
    c
      ? $t('team.switcher.meta', {
          // "PI" rather than "Programminkrement (PI)": the row keeps its fixed columns.
          kind: $t(c.kind === 'pi' ? 'meet.kind.pi' : 'team.cadence.kind.' + c.kind),
          weeks: c.lengthWeeks,
        })
      : '';
  const familyName = (id: string | undefined) =>
    id ? ws.skillFamilies?.find((f) => f.id === id)?.name : undefined;
  const countText = (key: string, n: number, extra: Record<string, unknown> = {}) =>
    $t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...extra });
  const platformName = (pl: PlatformStaffing) => pl.area?.name ?? $t('area.ungrouped');
  /** Bar and ring: share of the demand that is committed, 0 to 1. */
  const share = (committed: number, demand: number) =>
    demand > 0 ? Math.min(1, committed / demand) : 0;
  const RING = 2 * Math.PI * 15;
</script>

{#snippet ring(p: ProductStaffing)}
  <svg
    class="ring"
    viewBox="0 0 36 36"
    role="img"
    aria-label={$t('map.ring', { percent: percent(p.coverage) })}
  >
    <circle cx="18" cy="18" r="15" class="track" />
    <circle
      cx="18"
      cy="18"
      r="15"
      class="fill"
      class:low={p.coverage < 0.6}
      stroke-dasharray="{RING * share(p.committed, p.demand)} {RING}"
    />
    <text x="18" y="18" dominant-baseline="central" text-anchor="middle"
      >{Math.round(p.coverage * 100)}</text
    >
  </svg>
{/snippet}

{#snippet tile(p: ProductStaffing, match: boolean)}
  <li>
    <button
      type="button"
      class="product"
      class:weak={p.under > 0}
      class:dim={!match}
      data-product={p.team.id}
      onclick={() => onOpen(p.team.id)}
    >
      <span class="p-head">
        <span class="p-name">{p.team.name}</span>
        {#if p.demand > 0}{@render ring(p)}{/if}
      </span>
      {#if p.demand <= 0}
        <span class="p-state muted">{$t('map.product.none')}</span>
      {:else if p.open >= OPEN_EPS}
        <span class="p-state open">{$t('map.product.open', { fte: fte(p.open) })}</span>
      {:else}
        <span class="p-state full">{$t('map.product.full')}</span>
      {/if}
      {#if withLine && !$presenting}
        {@const line = fromLine(p.team.id)}
        <span class="p-line" data-from-line
          >{$t('cross.fromLine')}: {line || $t('cross.noLine')}</span
        >
      {/if}
      <span class="p-foot">
        {#if !$presenting}<OwnerAvatars unit={p.team} />{/if}
        <span class="p-cadence">{cadenceText(p.team.cadence)}</span>
        {#if p.under > 0}
          <span class="p-under">{countText('map.pill.under', p.under)}</span>
        {/if}
      </span>
    </button>
  </li>
{/snippet}

<section class="staffing-map" aria-labelledby="{uid}-title" data-staffing-map>
  <header class="head">
    <h3 id="{uid}-title">{$t('map.title')}</h3>
    <p class="note">{$t('map.note')}</p>
  </header>

  <div class="tiles">
    <div class="tile" data-map-tile="full">
      <span class="label">{$t('map.tile.full')}</span>
      <span class="value">{$t('map.tile.full.value', { n: totals.full, m: totals.products })}</span>
      <span class="sub">{$t('map.tile.full.sub', { n: totals.products - totals.full })}</span>
    </div>
    <div class="tile" data-map-tile="demand">
      <span class="label">{$t('map.tile.demand')}</span>
      <span class="value"
        >{$t('map.tile.demand.value', {
          demand: fte(totals.demand),
          committed: fte(totals.committed),
        })}</span
      >
      <span class="sub"
        >{$t('map.tile.demand.sub', {
          percent: percent(share(totals.committed, totals.demand)),
          open: fte(totals.open),
        })}</span
      >
    </div>
    <div class="tile" data-map-tile="after">
      <span class="label">{$t('map.tile.after')}</span>
      <span class="value ok">{$t('line.fte', { fte: fte(totals.afterMeetings) })}</span>
      <span class="sub">{$t('map.tile.after.sub', { fte: fte(totals.inMeetings) })}</span>
    </div>
    <div class="tile" data-map-tile="over">
      <span class="label">{$t('map.tile.over')}</span>
      <span class="value" class:bad={over > 0}>{over}</span>
      <span class="sub"
        >{$t('map.tile.over.sub', {
          limit: formatPercent($locale, ws.settings.thresholds.maxFte),
        })}</span
      >
    </div>
  </div>

  <div class="filters" role="search" aria-label={$t('map.filters')}>
    <input
      type="search"
      class="search"
      bind:value={query}
      placeholder={$t('map.search')}
      aria-label={$t('map.search')}
    />
    {#if !single && families.length > 0}
      <div class="seg" role="group" aria-label={$t('map.family.label')}>
        <button
          type="button"
          aria-pressed={family === undefined}
          onclick={() => (familyId = undefined)}>{$t('map.all')}</button
        >
        {#each families as f (f.id)}
          <button type="button" aria-pressed={family === f.id} onclick={() => (familyId = f.id)}
            >{f.name}</button
          >
        {/each}
      </div>
    {/if}
    <div class="seg" role="group" aria-label={$t('map.status.label')}>
      {#each ['all', 'open', 'hint'] as const as s (s)}
        <button type="button" aria-pressed={status === s} onclick={() => (status = s)}
          >{$t(`map.status.${s}`)}</button
        >
      {/each}
    </div>
    {#if !single && visible.length > 0}
      <button type="button" class="link" onclick={toggleAll}
        >{$t(allOpen ? 'map.collapse' : 'map.expand')}</button
      >
    {/if}
  </div>

  {#if visible.length === 0}
    <p class="empty">{$t('map.empty')}</p>
  {/if}
  <ul class="platforms">
    {#each visible as { pl, match, key } (key)}
      {@const open = isOpen(key)}
      {@const family = familyName(pl.area?.skillFamilyId)}
      <li class="platform" class:loose={!pl.area} data-platform={key}>
        <div class="row">
          <div class="who">
            {#if single}
              <span class="pl-name">{platformName(pl)}</span>
            {:else}
              <button
                type="button"
                class="toggle"
                aria-expanded={open}
                aria-controls="{uid}-{key}"
                onclick={() => toggle(key)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                <span class="pl-name">{platformName(pl)}</span>
              </button>
            {/if}
            <span class="pl-meta">
              {#if family}<span class="family">{family}</span>{/if}
              {#if pl.area?.cadence}<span>{cadenceText(pl.area.cadence)}</span>{/if}
            </span>
          </div>
          <div class="owners">
            {#if pl.area && !$presenting}<OwnerAvatars unit={pl.area} names />{/if}
          </div>
          <div class="cover">
            <span class="bar" aria-hidden="true"
              ><span style:width="{share(pl.committed, pl.demand) * 100}%"></span></span
            >
            <span class="cover-text"
              >{countText('map.platform.products', pl.products.length, {
                committed: fte(pl.committed),
                demand: fte(pl.demand),
              })}</span
            >
          </div>
          <div class="pills">
            {#if pl.open > 0}<span class="pill open">{$t('map.pill.open', { n: pl.open })}</span
              >{/if}
            {#if pl.under > 0}<span class="pill bad">{countText('map.pill.under', pl.under)}</span
              >{/if}
            {#if pl.ownerGaps > 0}<span class="pill">{countText('owner.gaps', pl.ownerGaps)}</span
              >{/if}
            {#if withLine && pl.area && !single}
              {@const area = pl.area}
              <button
                type="button"
                class="link matrix-row"
                data-no-print
                aria-label={$t('cross.matrix', { name: area.name })}
                onclick={() => openPlace(area.id, 'matrix')}>{$t('view.matrix')}</button
              >
            {/if}
          </div>
        </div>
        <ul class="products" id="{uid}-{key}" hidden={!open}>
          {#if open}
            {#each pl.products as p (p.team.id)}{@render tile(p, match.has(p.team.id))}{/each}
          {/if}
        </ul>
      </li>
    {/each}
  </ul>
  {#if hidden > 0 && !single}
    <p class="hidden-note">{countText('map.hidden', hidden)}</p>
  {/if}
</section>

<style>
  .p-line {
    font-size: 0.8rem;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  :global(#app) .staffing-map button.matrix-row {
    min-height: 1.75rem;
    padding: 0 0.35rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .staffing-map {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .head h3 {
    margin: 0;
    font-size: 1.15rem;
  }
  .note {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.75rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.85rem 1rem;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }
  .label,
  .sub {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .value {
    font-size: 1.6rem;
    font-weight: 750;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .value.ok {
    color: var(--ok);
  }
  .value.bad {
    color: var(--danger);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .search {
    flex: 1 1 14rem;
    max-width: 22rem;
    min-height: 2.75rem;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  :global(#app) .seg button {
    min-height: 2.25rem;
    padding: 0.25rem 0.75rem;
    border: 0;
    border-radius: var(--radius);
    background: none;
    box-shadow: none;
    color: var(--text);
    font-weight: 500;
  }
  :global(#app) .seg button[aria-pressed='true'] {
    background: var(--accent-soft, var(--surface-2));
    color: var(--accent-text);
    font-weight: 650;
  }
  :global(#app) .filters .link {
    margin-inline-start: auto;
    min-height: 2.75rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .platforms {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .platform {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-inline-start: 4px solid var(--area);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .platform.loose {
    border-inline-start-color: var(--border);
  }
  /* Fixed columns, so the rows of all platforms line up. */
  .row {
    display: grid;
    grid-template-columns: minmax(10rem, 1.3fr) minmax(9rem, 1.2fr) minmax(10rem, 1.3fr) minmax(
        9rem,
        1.3fr
      );
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  :global(#app) .toggle {
    justify-content: flex-start;
    gap: 0.35rem;
    min-height: 2.75rem;
    margin: -0.4rem 0 -0.4rem -0.4rem;
    padding: 0.2rem 0.4rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--text);
    text-align: start;
  }
  .toggle svg {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    transition: transform 0.15s;
  }
  .toggle[aria-expanded='true'] svg {
    transform: rotate(90deg);
  }
  .pl-name {
    color: var(--area);
    font-size: 1.05rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .loose .pl-name {
    color: var(--text);
  }
  .pl-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .family {
    padding: 0.05rem 0.5rem;
    border: 1px solid var(--area);
    border-radius: 999px;
    color: var(--area);
    font-weight: 600;
  }
  .owners {
    min-width: 0;
    font-size: 0.85rem;
  }
  .cover {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }
  .bar {
    display: block;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }
  .cover-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }
  .pill {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--surface-2, var(--border));
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .pill.open {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .pill.bad {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .products[hidden] {
    display: none;
  }
  .products {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
    gap: 0.6rem;
    margin-top: 0.75rem;
  }
  :global(#app) button.product {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: none;
    color: var(--text);
    font-weight: 400;
    text-align: start;
  }
  :global(#app) button.product:hover {
    border-color: var(--accent);
    background: var(--surface);
  }
  :global(#app) button.product.weak {
    border-inline-start: 4px solid var(--danger);
  }
  :global(#app) button.product.dim {
    opacity: 0.45;
  }
  .p-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .p-name {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .ring {
    flex: none;
    width: 2.4rem;
    height: 2.4rem;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3.5;
  }
  .ring .track {
    stroke: var(--border);
  }
  .ring .fill {
    stroke: var(--accent);
    stroke-linecap: round;
  }
  .ring .fill.low {
    stroke: var(--warn);
  }
  .ring text {
    transform: rotate(90deg);
    transform-origin: 18px 18px;
    fill: var(--text);
    font-size: 10px;
    font-weight: 700;
  }
  .p-state {
    font-size: 0.9rem;
    font-weight: 650;
  }
  .p-state.open {
    color: var(--warn);
  }
  .p-state.full {
    color: var(--ok);
  }
  .p-state.muted {
    color: var(--text-muted);
    font-weight: 500;
  }
  .p-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: auto;
    font-size: 0.82rem;
  }
  .p-under {
    color: var(--danger);
    font-weight: 600;
  }
  .p-cadence {
    color: var(--text-muted);
  }
  .empty,
  .hidden-note {
    margin: 0;
    color: var(--text-muted);
  }
  @media (max-width: 52rem) {
    .row {
      grid-template-columns: 1fr;
    }
    .pills {
      justify-content: flex-start;
    }
    .search {
      max-width: none;
    }
    :global(#app) .filters .link {
      margin-inline-start: 0;
    }
  }
  @media (max-width: 40rem) {
    .tiles {
      grid-template-columns: 1fr 1fr;
    }
    .value {
      font-size: 1.3rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle svg {
      transition: none;
    }
  }
  @media (forced-colors: active) {
    .bar span,
    .ring .fill {
      background: Highlight;
      stroke: Highlight;
    }
    :global(#app) button.product.weak {
      border-inline-start-color: CanvasText;
    }
  }
</style>
