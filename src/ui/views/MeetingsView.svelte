<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { costSummary, meetingCost } from '../../core/cost';
  import { duplicateEvent, removeEvent, upsertEvent } from '../../core/edit';
  import type { CalEvent } from '../../core/model';
  import { effectiveDuration } from '../../core/recurrence';
  import { validate } from '../../core/validate';
  import { nextDates } from '../../core/views';
  import { occurrencesPerWeek } from '../../core/load';
  import { formatDisplayDate, formatEuro, formatNumber, locale, translate as t } from '../../i18n';
  import { initials, inkOn } from '../avatar';
  import ColourField, { PALETTE } from '../components/ColourField.svelte';
  import CostCard from '../components/CostCard.svelte';
  import EventForm from '../components/EventForm.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import { ruleSummary } from '../meetings/rules';
  import { fieldErrors } from '../state/form';
  import { activeTeamId, index, workspace } from '../state/workspace';

  interface Props {
    /** Id of a meeting of the active team to open for editing right away. */
    edit?: string;
    /** Called once that meeting is open, so that it is not opened again. */
    onEditOpened?: () => void;
  }
  let { edit, onEditOpened }: Props = $props();

  const { canUndo } = workspace;

  const team = $derived($workspace.teams.find((x) => x.id === $activeTeamId));
  const categories = $derived($workspace.categories);
  const roles = $derived($workspace.roles);

  const uid = $props.id();
  /** `opener` is what gets the focus back: `add` or the id of the event whose Edit opened the form. */
  let editing = $state<{ key: number; event: CalEvent; opener: string } | null>(null);
  let counter = 0;
  let root: HTMLElement | undefined;

  // The form edits a draft; a foreign change to teams, categories or roles (undo, open, new)
  // makes it stale, so it is closed. Settings-only changes (language, ...) keep it.
  let own = false;
  let signature = '';
  onMount(() => {
    const stop = [
      workspace.subscribe((ws) => {
        const next = JSON.stringify([ws.teams, ws.categories, ws.roles]);
        if (!own && next !== signature) editing = null;
        signature = next;
      }),
      activeTeamId.subscribe(() => {
        editing = null;
        query = '';
      }),
    ];
    if (edit !== undefined) {
      const event = team?.events.find((e) => e.id === edit);
      if (event) open(event, event.id);
      onEditOpened?.();
    }
    // "Next" moves on as meetings end, also while the view stays open.
    const clock = setInterval(() => (now = new Date()), 60_000);
    return () => {
      stop.forEach((fn) => fn());
      clearInterval(clock);
    };
  });

  function commit(change: Parameters<typeof workspace.apply>[0]) {
    own = true;
    try {
      return workspace.apply(change);
    } finally {
      own = false;
    }
  }

  async function focusSoon(selector: string, fallback = '[data-add]') {
    await tick();
    (
      root?.querySelector<HTMLElement>(selector) ?? root?.querySelector<HTMLElement>(fallback)
    )?.focus();
  }

  const selectorFor = (opener: string) =>
    opener === 'add' ? '[data-add]' : `[data-edit="${CSS.escape(opener)}"]`;

  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  // ---------- table data ----------

  const roleOf = (id: string) => roles.find((r) => r.id === id);

  let now = $state(new Date());
  const next = $derived.by(() => {
    if (!team) return null;
    const p = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    return nextDates(
      team,
      $workspace.settings,
      $index,
      today,
      now.getHours() * 60 + now.getMinutes(),
    );
  });
  const short = $derived(
    new Intl.DateTimeFormat($locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }),
  );
  const nextLabel = (d: string) => short.format(new Date(d + 'T00:00:00Z'));

  // ---------- costs: only with an hourly rate ----------

  const rate = $derived($workspace.settings.hourlyRate);
  const costs = $derived(
    rate && team ? costSummary($workspace, $index, { teamId: team.id }, rate) : null,
  );
  const euro = (n: number) => formatEuro($locale, n);

  let query = $state('');
  const summaries = $derived(
    new Map(team?.events.map((e) => [e.id, ruleSummary(e.rule, team, $t, $locale)]) ?? []),
  );
  const visible = $derived.by(() => {
    if (!team) return [];
    const q = query.trim().toLocaleLowerCase($locale);
    if (!q) return team.events;
    return team.events.filter((e) =>
      [
        e.name,
        categoryOf(e.categoryId)?.name ?? '',
        summaries.get(e.id) ?? '',
        ...e.participants.map((p) => roleName(p.roleId)),
      ].some((text) => text.toLocaleLowerCase($locale).includes(q)),
    );
  });

  // ---------- form ----------

  function blankEvent(): CalEvent {
    const first = roles[0];
    return {
      id: '',
      name: '',
      categoryId: categories[0]?.id ?? '',
      rule: { type: 'weekly', weekday: 1 },
      time: '09:00',
      duration: 60,
      participants: first ? [{ roleId: first.id, share: 1 }] : [],
      preparation: 0,
    };
  }

  function open(event: CalEvent, opener: string) {
    // A new meeting must not vanish behind the filter once it is saved.
    if (opener === 'add') query = '';
    editing = { key: ++counter, event: structuredClone($state.snapshot(event)), opener };
  }

  async function close() {
    const opener = editing?.opener ?? 'add';
    editing = null;
    await focusSoon(selectorFor(opener));
  }

  /** `doCommit` false only validates the event and reports what would be refused. */
  function save(event: CalEvent, doCommit = true): Record<string, string> | null {
    if (!team) return { '': 'error.type' };
    const ti = $workspace.teams.findIndex((x) => x.id === team.id);
    const ei =
      event.id === '' ? team.events.length : team.events.findIndex((e) => e.id === event.id);
    const teamId = team.id;
    const result = doCommit
      ? commit((ws) => upsertEvent(ws, teamId, event))
      : validate(upsertEvent($workspace, teamId, event)[0]);
    if (result.ok) {
      if (doCommit) void close();
      return null;
    }
    const mapped = fieldErrors(result.errors, `teams.${ti}.events.${ei}`);
    return Object.keys(mapped).length > 0 ? mapped : { '': result.errors[0]?.key ?? 'error.type' };
  }

  // ---------- table actions ----------

  /** While a form is open, only its own row can start editing again. */
  const locked = (event: CalEvent) => editing !== null && editing.event.id !== event.id;

  function duplicate(event: CalEvent) {
    if (!team) return;
    const teamId = team.id;
    commit((ws) => duplicateEvent(ws, teamId, event.id));
  }

  function remove(event: CalEvent, at: number) {
    if (!team) return;
    const teamId = team.id;
    const neighbour = visible[at + 1] ?? visible[at - 1];
    const result = commit((ws) => removeEvent(ws, teamId, event.id));
    if (!result.ok) return;
    if (editing?.event.id === event.id) editing = null;
    // The neighbour's Edit is disabled while a form is open; its Delete never is.
    const id = neighbour ? CSS.escape(neighbour.id) : '';
    void focusSoon(
      neighbour ? `[data-edit="${id}"]:not(:disabled), [data-delete="${id}"]` : '[data-add]',
    );
  }
</script>

<div class="meetings stack" bind:this={root}>
  {#if !team}
    <p class="empty card">{$t('meet.none')}</p>
  {:else}
    {#if costs && rate}
      <CostCard summary={costs} {rate} />
    {/if}
    <div class="card">
      <div class="toolbar">
        <button
          type="button"
          class="primary add"
          data-add
          disabled={categories.length === 0}
          aria-describedby={categories.length === 0 ? 'meet-needs-category' : undefined}
          onclick={() => open(blankEvent(), 'add')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {$t('meet.add')}
        </button>
        {#if team.events.length > 0}
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" /></svg
            >
            <span class="sr-only">{$t('meet.filter')}</span>
            <input type="search" bind:value={query} placeholder={$t('meet.filter')} />
          </label>
        {/if}
        <button type="button" class="undo" disabled={!$canUndo} onclick={() => workspace.undo()}
          >{$t('meet.undo')}</button
        >
      </div>
      {#if categories.length === 0}
        <p class="empty" id="meet-needs-category">{$t('meet.needsCategory')}</p>
      {/if}

      {#if editing}
        <p class="empty" id="meet-open-note">{$t('meet.openform')}</p>
        {#key editing.key}
          <EventForm event={editing.event} {team} {categories} {roles} {save} cancel={close} />
        {/key}
      {/if}

      {#if team.events.length === 0}
        <p class="empty">{$t('meet.empty')}</p>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
        <div class="table-wrap" role="region" aria-labelledby="{uid}-caption" tabindex="0">
          <table>
            <caption id="{uid}-caption" class="sr-only"
              >{$t('meet.table.caption', { team: team.name })}</caption
            >
            <thead>
              <tr>
                <th scope="col">{$t('meet.col.meeting')}</th>
                <th scope="col">{$t('meet.col.when')}</th>
                <th scope="col">{$t('meet.col.next')}</th>
                {#if rate}
                  <th scope="col" class="num">{$t('meet.col.cost')}</th>
                {/if}
                <th scope="col">{$t('meet.col.participants')}</th>
                <th scope="col"><span class="sr-only">{$t('meet.col.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each visible as event, i (event.id)}
                {@const category = categoryOf(event.categoryId)}
                {@const minutes = formatNumber($locale, effectiveDuration(event, team), 0)}
                {@const cost = rate
                  ? meetingCost(team, event, effectiveDuration(event, team), rate)
                  : 0}
                {@const when = next?.get(event.id)}
                <tr>
                  <th scope="row">
                    <span class="name">
                      <span class="bar" style:background={category?.colour} aria-hidden="true"
                      ></span>
                      <span>
                        <span class="title">{event.name}</span>
                        <span class="sub">{category?.name ?? event.categoryId}</span>
                      </span>
                    </span>
                  </th>
                  <td>
                    {summaries.get(event.id)}
                    <span class="sub"
                      >{event.time} · {$t(
                        event.scaling ? 'meet.duration.scaled' : 'meet.duration.fixed',
                        { n: minutes },
                      )}</span
                    >
                  </td>
                  <td class="next">
                    {#if when}
                      <time datetime={when} title={formatDisplayDate($locale, when, 'long')}
                        >{nextLabel(when)}</time
                      >
                    {:else}
                      <span class="none" title={$t('meet.next.none.hint')}
                        >{$t('meet.next.none')}</span
                      >
                    {/if}
                  </td>
                  {#if rate}
                    {@const perWeek = occurrencesPerWeek(event.rule, team)}
                    <td class="num cost" data-cost={event.id}>
                      {euro(cost)}
                      {#if perWeek > 0}
                        <span class="sub"
                          >{$t('meet.cost.week', { amount: euro(perWeek * cost) })}</span
                        >
                      {:else if event.rule.type === 'once'}
                        <span class="sub">{$t('meet.cost.once')}</span>
                      {/if}
                    </td>
                  {/if}
                  <td>
                    <ul class="roles">
                      {#each event.participants as p, pi (pi)}
                        {@const name = roleName(p.roleId)}
                        {@const colour = roleOf(p.roleId)?.colour ?? '#4b5470'}
                        <li class="role">
                          <span
                            class="ini"
                            style:background={colour}
                            style:color={inkOn(colour)}
                            aria-hidden="true">{initials(name)}</span
                          >
                          {p.share < 1
                            ? $t('meet.role.share', {
                                role: name,
                                share: formatNumber($locale, p.share * 100, 0),
                              })
                            : name}
                        </li>
                      {/each}
                    </ul>
                  </td>
                  <td>
                    <div class="icons">
                      <button
                        type="button"
                        class="icon"
                        data-tip={$t('meet.edit')}
                        data-edit={event.id}
                        disabled={locked(event)}
                        aria-describedby={locked(event) ? 'meet-open-note' : undefined}
                        aria-label={$t('meet.edit.named', { name: event.name })}
                        onclick={() => open(event, event.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                          ><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg
                        >
                      </button>
                      <button
                        type="button"
                        class="icon"
                        data-tip={$t('meet.duplicate')}
                        disabled={locked(event)}
                        aria-describedby={locked(event) ? 'meet-open-note' : undefined}
                        aria-label={$t('meet.duplicate.named', { name: event.name })}
                        onclick={() => duplicate(event)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                          ><path d="M8 8h11v11H8zM5 16V5h11" /></svg
                        >
                      </button>
                      <button
                        type="button"
                        class="icon danger"
                        data-tip={$t('meet.delete')}
                        data-delete={event.id}
                        aria-label={$t('meet.delete.named', { name: event.name })}
                        onclick={() => remove(event, i)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                          ><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" /></svg
                        >
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="empty status" role="status">
          {visible.length === 0 ? $t('meet.filter.none', { q: query.trim() }) : ''}
        </p>
      {/if}
    </div>
  {/if}

  <div class="card">
    <ListEditor
      kind="categories"
      items={categories}
      heading={$t('meet.categories')}
      addLabel={$t('meet.categories.add')}
      create={(name) => ({ name, colour: PALETTE[categories.length % PALETTE.length]!.hex })}
    >
      {#snippet extra(category, ctx)}
        <ColourField
          value={category.colour}
          label={$t('colour.of', { name: category.name })}
          onchange={(colour) => ctx.update({ colour })}
        />
      {/snippet}
    </ListEditor>
  </div>
</div>

<style>
  .meetings {
    max-width: 72rem;
  }
  .empty {
    color: var(--text-muted);
  }
  /* The live region stays in the tree while empty, so its message is announced. */
  .status:empty {
    margin: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  svg {
    width: 1.1rem;
    height: 1.1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 18rem;
    min-width: 12rem;
  }
  .search svg {
    position: absolute;
    left: 0.75rem;
    color: var(--text-muted);
    pointer-events: none;
  }
  :global(#app) .search input {
    width: 100%;
    padding-left: 2.4rem;
  }
  .undo {
    margin-left: auto;
  }
  .toolbar button {
    min-height: 2.5rem;
  }
  .table-wrap {
    /* Containing block for the hidden caption and header: they must not widen the page. */
    position: relative;
    overflow-x: auto;
  }
  table {
    width: 100%;
  }
  th {
    text-align: left;
  }
  tbody th {
    font-weight: 400;
  }
  .name {
    display: flex;
    align-items: stretch;
    gap: 0.7rem;
  }
  .bar {
    width: 4px;
    border-radius: 4px;
    flex: none;
    border: 1px solid transparent;
  }
  .title {
    display: block;
    font-weight: 700;
  }
  .sub {
    display: block;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .next {
    font-weight: 700;
    white-space: nowrap;
  }
  .num {
    text-align: right;
  }
  .cost {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .cost .sub {
    font-weight: 400;
  }
  .next .none {
    font-weight: 400;
    color: var(--text-muted);
  }
  .roles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .role {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.6rem 0.15rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 0.875rem;
    white-space: nowrap;
  }
  .ini {
    display: inline-grid;
    place-items: center;
    min-width: 1.4rem;
    height: 1.4rem;
    padding: 0 0.2rem;
    border-radius: 999px;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .icons {
    display: flex;
    justify-content: flex-end;
    gap: 0.15rem;
  }
  :global(#app) .icons .icon {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    color: var(--text-muted);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  :global(#app) .icons .icon:hover:not(:disabled) {
    color: var(--accent-text);
    background: var(--accent-soft);
  }
  :global(#app) .icons .icon.danger:hover:not(:disabled) {
    color: var(--danger);
    background: var(--danger-soft);
  }
  /* The visible tooltip repeats the start of the accessible name ("Edit" of "Edit Weekly Sync"). */
  .icons .icon::after {
    content: attr(data-tip);
    position: absolute;
    top: 50%;
    right: calc(100% + 0.3rem);
    z-index: 2;
    translate: 0 -50%;
    display: none;
    padding: 0.2rem 0.5rem;
    border-radius: 0.4rem;
    background: var(--text);
    color: var(--surface);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
  .icons .icon:is(:hover, :focus-visible):not(:disabled)::after {
    display: block;
  }
  @media (forced-colors: active) {
    .bar {
      border-color: CanvasText;
    }
    .icons .icon::after {
      border: 1px solid CanvasText;
    }
  }
</style>
