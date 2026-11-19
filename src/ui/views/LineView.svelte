<script lang="ts">
  import { DEFAULT_CONTEXT_SWITCH } from '../../core/contextSwitch';
  import { loadPerWeek } from '../../core/load';
  import {
    childUnits,
    isLineGroup,
    overLimitPeople,
    staffRows,
    unitStats,
  } from '../../core/lineStaff';
  import type { LineUnit } from '../../core/model';
  import { formatNumber, formatPercent, levels, locale, translate as t } from '../../i18n';
  import LineUnitDialog from '../LineUnitDialog.svelte';
  import LineStaff from '../components/LineStaff.svelte';
  import LineTree from '../components/LineTree.svelte';
  import StaffingBoard from '../components/StaffingBoard.svelte';
  import { presenting } from '../state/present';
  import { index, workspace } from '../state/workspace';
  import { LINE_ICON } from '../viewIcons';

  /**
   * A line unit's page (#316). A line team has the tabs Personal (its people with skills,
   * contract, commitments, free FTE and hints) and Besetzung (#319: staffing open demands); a
   * specialist group shows its line tree first (#390) and then all its people. While presenting there
   * are no tabs and no people list: only figures.
   */
  let { unit, onOpen }: { unit: LineUnit; onOpen: (selection: string) => void } = $props();

  const ws = $derived($workspace);
  const weeks = $derived(loadPerWeek(ws, $index));
  const over = $derived(overLimitPeople(weeks, ws));
  const rows = $derived(staffRows(ws, unit.id, weeks, over));
  const stats = $derived(unitStats(rows));
  const group = $derived(isLineGroup(ws, unit.id));
  const family = $derived(ws.skillFamilies?.find((f) => f.id === unit.skillFamilyId));
  const manager = $derived(ws.people.find((p) => p.id === unit.managerPersonId));
  const kids = $derived(childUnits(ws, unit.id));

  const fte = (n: number) => formatNumber($locale, n, 1);
  const peopleText = (n: number) => $t(n === 1 ? 'org.people.one' : 'org.people.other', { n });
  const limitText = $derived(
    $t('line.tile.hints.rule', {
      limit: formatPercent($locale, ws.settings.thresholds.maxFte),
      from: ws.settings.thresholds.contextSwitch ?? DEFAULT_CONTEXT_SWITCH,
    }),
  );

  const TABS = ['staff', 'board'] as const;
  let tab = $state<'staff' | 'board'>('staff');
  function tabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    tab = tab === 'staff' ? 'board' : 'staff';
    document.getElementById(`line-tab-${tab}`)?.focus();
  }
  const showStaff = $derived(!$presenting);
  let dialog: LineUnitDialog | undefined = $state();
  let addButton: HTMLButtonElement | undefined = $state();

  const empty = $derived(rows.length === 0 && kids.length === 0);
</script>

<div class="line-view">
  <section class="tiles" aria-label={$t('line.tiles', { name: unit.name })}>
    <div class="tile id">
      <span class="label"
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d={LINE_ICON} /></svg>{[
          group ? $levels.lineGroup : $levels.lineTeam,
          family?.name,
        ]
          .filter(Boolean)
          .join(' · ')}</span
      >
      <span class="value name">{unit.name}</span>
      {#if !$presenting}
        <span class="sub"
          >{manager
            ? $t('line.tile.manager', { name: manager.name })
            : $t('line.tile.noManager')}</span
        >
      {/if}
    </div>
    <div class="tile">
      <span class="label">{$t('line.tile.contract')}</span>
      <span class="value">{$t('line.fte', { fte: fte(stats.contract) })}</span>
      <span class="sub">{peopleText(stats.people)}</span>
    </div>
    <div class="tile">
      <span class="label">{$t('line.tile.committed', { teams: $levels.teams })}</span>
      <span class="value">{$t('line.fte', { fte: fte(stats.committed) })}</span>
      <span class="sub" class:bad={stats.free < 0}
        >{stats.free < 0
          ? $t('line.tile.overbooked', { fte: fte(-stats.free) })
          : $t('line.tile.free', { fte: fte(stats.free) })}</span
      >
    </div>
    <div class="tile">
      <span class="label">{$t('line.tile.hints')}</span>
      <span class="value" class:bad={stats.hinted > 0}>{stats.hinted}</span>
      <span class="sub">{limitText}</span>
    </div>
  </section>

  {#if kids.length > 0}
    <section class="structure" aria-labelledby="line-tree-title">
      <h3 id="line-tree-title">{$t('line.tree.title')}</h3>
      <LineTree root={unit} {rows} {onOpen} />
    </section>
  {/if}

  {#if empty}
    <section class="empty" aria-labelledby="line-empty-title">
      <h3 id="line-empty-title">{$t('line.empty.title', { team: $levels.lineTeamLc })}</h3>
      <p>{$t('line.empty.text', { teams: $levels.teamsLc })}</p>
      {#if !$presenting}
        <div class="empty-actions">
          <button
            type="button"
            class="secondary"
            bind:this={addButton}
            onclick={() => dialog?.show(undefined, unit.id)}
            >{$t('line.unit.addBelow', { team: $levels.lineTeamLc })}</button
          >
        </div>
        <p class="note">{$t('line.empty.people')}</p>
      {/if}
    </section>
  {/if}

  {#if !group && showStaff}
    <div class="tabs" role="tablist" aria-label={$t('line.tabs', { name: unit.name })}>
      {#each TABS as id (id)}
        <button
          type="button"
          role="tab"
          id="line-tab-{id}"
          aria-selected={tab === id}
          aria-controls="line-panel-{id}"
          tabindex={tab === id ? 0 : -1}
          onclick={() => (tab = id)}
          onkeydown={tabKey}>{$t(id === 'staff' ? 'line.tab.staff' : 'line.tab.board')}</button
        >
      {/each}
    </div>
    {#if tab === 'staff'}
      <div role="tabpanel" id="line-panel-staff" aria-labelledby="line-tab-staff">
        <LineStaff {rows} {unit} />
      </div>
    {:else}
      <div role="tabpanel" id="line-panel-board" aria-labelledby="line-tab-board">
        {#key unit.id}<StaffingBoard {unit} />{/key}
      </div>
    {/if}
  {:else if group && showStaff && rows.length > 0}
    <section aria-labelledby="line-staff-title">
      <h3 id="line-staff-title">{$t('line.staff.all')}</h3>
      <LineStaff {rows} {unit} lineColumn />
    </section>
  {/if}
</div>

<LineUnitDialog bind:this={dialog} returnFocus={() => addButton?.focus()} />

<style>
  .line-view {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) * 1.25);
    min-width: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.75rem;
  }
  @media (max-width: 40rem) {
    .tiles {
      grid-template-columns: 1fr 1fr;
    }
    .tile.id {
      grid-column: 1 / -1;
    }
    .tile .value:not(.name) {
      font-size: 1.3rem;
    }
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
  .label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .label svg {
    flex: none;
    width: 0.9rem;
    height: 0.9rem;
    fill: none;
    stroke: var(--line);
    stroke-width: 2.2;
    stroke-linejoin: round;
  }
  .value {
    font-size: 1.6rem;
    font-weight: 750;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .value.name {
    font-size: 1.25rem;
    overflow-wrap: anywhere;
  }
  .sub {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .bad {
    color: var(--danger);
  }
  .sub.bad {
    color: var(--danger);
    font-weight: 600;
  }
  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
  }
  .empty {
    padding: var(--space);
    border: 1px dashed var(--border-strong, var(--border));
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }
  .empty p {
    margin: 0 0 0.75rem;
    max-width: 60ch;
  }
  .empty .note {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .tabs {
    display: inline-flex;
    align-self: flex-start;
    gap: 0.2rem;
    padding: 0.2rem;
    border-radius: 0.7rem;
    background: var(--surface-2);
  }
  :global(#app) .line-view .tabs button[role='tab'] {
    min-height: 2.25rem;
    padding: 0.3rem 0.9rem;
    border: 0;
    border-radius: 0.55rem;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  :global(#app) .line-view .tabs button[role='tab'][aria-selected='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.12));
  }
</style>
