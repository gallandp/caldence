<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { diffDays } from '../../core/date';
  import { newId, removeCycle, upsertCycle } from '../../core/edit';
  import type { Cycle, Team } from '../../core/model';
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';
  import { Problems } from '../state/problems.svelte';
  import { activeTeamId, localToday, workspace } from '../state/workspace';
  import FieldError from './FieldError.svelte';

  let { team }: { team: Team } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit, fail, describe, invalid } = problems;

  let root: HTMLElement | undefined;
  async function focusSoon(selector: string) {
    await tick();
    root?.querySelector<HTMLElement>(selector)?.focus();
  }

  let newCycle = $state('');
  // A new cycle's name belongs to the team it was typed for.
  onMount(() => activeTeamId.subscribe(() => (newCycle = '')));

  function saveCycle(errorId: string, label: string, cycle: Cycle): boolean {
    const teamId = team.id;
    return commit(errorId, label, (ws) => upsertCycle(ws, teamId, cycle));
  }

  function addCycle(event: Event) {
    event.preventDefault();
    const name = newCycle.trim();
    const label = $t('team.cycles.new');
    if (name === '') return fail('cycle-add', 'list.error.empty', label);
    if (saveCycle('cycle-add', label, { id: '', name, milestones: [] })) newCycle = '';
  }

  function renameCycle(cycle: Cycle, event: Event) {
    const name = (event.currentTarget as HTMLInputElement).value.trim();
    if (name === '') return fail(`cycle-${cycle.id}`, 'list.error.empty', cycle.name);
    saveCycle(`cycle-${cycle.id}`, cycle.name, { ...cycle, name });
  }

  function deleteCycle(cycle: Cycle) {
    const teamId = team.id;
    const done = commit(`cycle-${cycle.id}`, cycle.name, (ws) => removeCycle(ws, teamId, cycle.id));
    if (done) void focusSoon('[data-cycle-add]');
  }

  type Draft = { name: string; date: string };
  /** New-milestone drafts by team and cycle: cycle ids repeat across teams. */
  let drafts = $state<Record<string, Draft>>({});
  const draftKey = (cycleId: string) => `${team.id}/${cycleId}`;
  const draftOf = (cycleId: string): Draft => drafts[draftKey(cycleId)] ?? { name: '', date: '' };
  const setDraft = (cycleId: string, patch: Partial<Draft>) =>
    (drafts[draftKey(cycleId)] = { ...draftOf(cycleId), ...patch });

  function addMilestone(cycle: Cycle, event: Event) {
    event.preventDefault();
    const draft = draftOf(cycle.id);
    const name = draft.name.trim();
    const errorId = `ms-add-${cycle.id}`;
    if (name === '') return fail(errorId, 'list.error.empty', $t('team.milestone.new'));
    if (draft.date === '') return fail(errorId, 'error.required', $t('team.milestone.newDate'));
    const id = newId(
      'm',
      cycle.milestones.map((m) => m.id),
    );
    const milestones = [...cycle.milestones, { id, name, date: draft.date }];
    if (saveCycle(errorId, name, { ...cycle, milestones }))
      setDraft(cycle.id, { name: '', date: '' });
  }

  function editMilestone(cycle: Cycle, id: string, patch: Partial<{ name: string; date: string }>) {
    const current = cycle.milestones.find((m) => m.id === id);
    if (!current) return;
    const milestones = cycle.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m));
    saveCycle(`ms-${cycle.id}-${id}`, current.name, { ...cycle, milestones });
  }

  function renameMilestone(cycle: Cycle, id: string, event: Event) {
    const name = (event.currentTarget as HTMLInputElement).value.trim();
    const label = $t('team.milestone.name');
    if (name === '') return fail(`ms-${cycle.id}-${id}`, 'list.error.empty', label);
    editMilestone(cycle, id, { name });
  }

  function redateMilestone(cycle: Cycle, id: string, event: Event) {
    const date = (event.currentTarget as HTMLInputElement).value;
    if (date === '')
      return fail(`ms-${cycle.id}-${id}`, 'error.required', $t('team.milestone.date'));
    editMilestone(cycle, id, { date });
  }

  function removeMilestone(cycle: Cycle, id: string) {
    const current = cycle.milestones.find((m) => m.id === id);
    if (!current) return;
    const milestones = cycle.milestones.filter((m) => m.id !== id);
    const done = saveCycle(`ms-list-${cycle.id}`, current.name, { ...cycle, milestones });
    if (done) void focusSoon(`[data-ms-add="${cycle.id}"]`);
  }

  /** Position of a date on the planning horizon in %, or null outside of it. */
  const horizon = $derived($workspace.settings.horizon);
  function onHorizon(date: string): number | null {
    const span = diffDays(horizon.to, horizon.from);
    if (span <= 0 || date < horizon.from || date > horizon.to) return null;
    return (diffDays(date, horizon.from) / span) * 100;
  }
  // The fill up to today moves on while the view stays open.
  let today = $state(localToday());
  onMount(() => {
    const clock = setInterval(() => (today = localToday()), 60_000);
    return () => clearInterval(clock);
  });
  const todayAt = $derived(today < horizon.from ? 0 : (onHorizon(today) ?? 100));
</script>

{#snippet cross()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
{/snippet}

{#snippet plus()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}

<section class="card cycles-card" aria-labelledby="{uid}-h" bind:this={root}>
  <h3 id="{uid}-h">{$t('team.cycles')}</h3>
  <p class="hint">{$t('team.cycles.hint')}</p>
  {#key problems.epoch}
    {#if team.cycles.length === 0}
      <p class="empty">{$t('team.cycles.empty')}</p>
    {:else}
      <ul class="cycles">
        {#each team.cycles as cycle (cycle.id)}
          <li>
            <div class="cycle-head">
              <input
                class="title"
                type="text"
                value={cycle.name}
                aria-label={$t('team.cycle.rename', { name: cycle.name })}
                aria-invalid={invalid(`cycle-${cycle.id}`)}
                aria-describedby={describe(`cycle-${cycle.id}`)}
                onchange={(e) => renameCycle(cycle, e)}
              />
              <span class="count">
                {$t(
                  cycle.milestones.length === 1
                    ? 'team.milestones.count.one'
                    : 'team.milestones.count.other',
                  { n: formatNumber($locale, cycle.milestones.length, 0) },
                )}
              </span>
              <button
                type="button"
                class="icon-button"
                aria-label={$t('team.cycle.delete', { name: cycle.name })}
                aria-describedby={describe(`cycle-${cycle.id}`)}
                onclick={() => deleteCycle(cycle)}>{@render cross()}</button
              >
            </div>
            <FieldError {problems} id="cycle-{cycle.id}" />

            {#if cycle.milestones.length > 0}
              <!-- The milestones as points on the planning horizon; the fields below name them. -->
              <div class="timeline" aria-hidden="true">
                <span class="line"><span class="fill" style:width="{todayAt}%"></span></span>
                {#each cycle.milestones as ms (ms.id)}
                  {@const at = onHorizon(ms.date)}
                  {#if at !== null}<i class="point" style:left="{at}%"></i>{/if}
                {/each}
                <span class="ends">
                  <span>{formatDisplayDate($locale, horizon.from, 'short')}</span>
                  <span>{formatDisplayDate($locale, horizon.to, 'short')}</span>
                </span>
              </div>
              <div class="heads" aria-hidden="true">
                <span>{$t('team.milestone.name')}</span><span class="date-head"
                  >{$t('team.milestone.date')}</span
                >
              </div>
            {/if}

            <fieldset>
              <legend class="sr-only">{$t('team.milestones', { cycle: cycle.name })}</legend>
              {#if cycle.milestones.length === 0}
                <p class="empty">{$t('team.milestones.empty')}</p>
              {/if}
              {#each cycle.milestones as ms (ms.id)}
                {@const mid = `ms-${cycle.id}-${ms.id}`}
                <div class="row line-row">
                  <input
                    class="grow"
                    type="text"
                    value={ms.name}
                    aria-label={$t('team.milestone.rename', { name: ms.name })}
                    aria-invalid={invalid(mid)}
                    aria-describedby={describe(mid)}
                    onchange={(e) => renameMilestone(cycle, ms.id, e)}
                  />
                  <input
                    type="date"
                    value={ms.date}
                    aria-label={$t('team.milestone.redate', { name: ms.name })}
                    aria-invalid={invalid(mid)}
                    aria-describedby={describe(mid)}
                    onchange={(e) => redateMilestone(cycle, ms.id, e)}
                  />
                  <button
                    type="button"
                    class="icon-button"
                    aria-label={$t('team.milestone.delete', { name: ms.name })}
                    aria-describedby={describe(`ms-list-${cycle.id}`)}
                    onclick={() => removeMilestone(cycle, ms.id)}>{@render cross()}</button
                  >
                </div>
                <FieldError {problems} id={mid} />
              {/each}
              <FieldError {problems} id="ms-list-{cycle.id}" />

              <form class="row add-row" onsubmit={(e) => addMilestone(cycle, e)}>
                <div class="field grow">
                  <label for="{uid}-msn-{cycle.id}">{$t('team.milestone.new')}</label>
                  <input
                    id="{uid}-msn-{cycle.id}"
                    type="text"
                    data-ms-add={cycle.id}
                    value={draftOf(cycle.id).name}
                    aria-invalid={invalid(`ms-add-${cycle.id}`)}
                    aria-describedby={describe(`ms-add-${cycle.id}`)}
                    oninput={(e) => setDraft(cycle.id, { name: e.currentTarget.value })}
                  />
                </div>
                <div class="field">
                  <label for="{uid}-msd-{cycle.id}">{$t('team.milestone.newDate')}</label>
                  <input
                    id="{uid}-msd-{cycle.id}"
                    type="date"
                    value={draftOf(cycle.id).date}
                    aria-invalid={invalid(`ms-add-${cycle.id}`)}
                    aria-describedby={describe(`ms-add-${cycle.id}`)}
                    oninput={(e) => setDraft(cycle.id, { date: e.currentTarget.value })}
                  />
                </div>
                <button type="submit" class="secondary add"
                  >{@render plus()}{$t('team.milestone.add')}</button
                >
              </form>
              <FieldError {problems} id="ms-add-{cycle.id}" />
            </fieldset>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="row add-row" onsubmit={addCycle}>
      <div class="field grow">
        <label for="{uid}-cycle-new">{$t('team.cycles.new')}</label>
        <input
          id="{uid}-cycle-new"
          type="text"
          data-cycle-add
          bind:value={newCycle}
          aria-invalid={invalid('cycle-add')}
          aria-describedby={describe('cycle-add')}
        />
      </div>
      <button type="submit" class="secondary add">{@render plus()}{$t('team.cycles.add')}</button>
    </form>
    <FieldError {problems} id="cycle-add" />
  {/key}
</section>

<style>
  h3 {
    margin: 0 0 0.35rem;
  }
  .hint,
  .empty {
    margin: 0 0 1rem;
    color: var(--text-muted);
  }
  .cycles {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.75rem;
  }
  .add-row {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--border-strong);
  }
  .line-row {
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .line-row input[type='date'] {
    width: 9.5rem;
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
  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
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
  .cycles > li {
    margin-bottom: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .cycle-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  :global(#app) .cycle-head .title {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 700;
    font-size: 1rem;
    border-color: var(--border);
    background: transparent;
  }
  :global(#app) .cycle-head .title:hover,
  :global(#app) .cycle-head .title:focus {
    border-color: var(--border-strong);
    background: var(--surface);
  }
  .count {
    flex: none;
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 650;
    white-space: nowrap;
    background: var(--ok-soft);
    color: var(--ok);
  }
  .timeline {
    position: relative;
    margin: 1rem 0.5rem 0.75rem;
  }
  .timeline .line {
    display: block;
    height: 0.25rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .timeline .fill {
    display: block;
    height: 100%;
    background: var(--brand-gradient);
  }
  .point {
    position: absolute;
    top: -0.3rem;
    width: 0.8rem;
    height: 0.8rem;
    translate: -50% 0;
    rotate: 45deg;
    border-radius: 0.2rem;
    background: var(--surface);
    border: 3px solid var(--ok);
    box-sizing: border-box;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 0.45rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .heads {
    display: flex;
    gap: 0.75rem;
    margin: 0.5rem 3.25rem 0.2rem 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .heads > :first-child {
    flex: 1;
  }
  .date-head {
    width: 9.5rem;
  }
  :global(#app) .cycles-card fieldset {
    margin: 0.5rem 0 0;
    padding: 0;
    border: 0;
    min-width: 0;
    background: none;
  }
  @media (forced-colors: active) {
    .count,
    .point {
      border: 1px solid CanvasText;
    }
    .timeline .fill {
      background: Highlight;
    }
    .timeline .line {
      border: 1px solid CanvasText;
    }
  }
</style>
