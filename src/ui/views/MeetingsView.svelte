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
  import CadenceCard from '../components/CadenceCard.svelte';
  import CostCard from '../components/CostCard.svelte';
  import CyclesCard from '../components/CyclesCard.svelte';
  import EventForm from '../components/EventForm.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import { ruleShort, ruleSummary } from '../meetings/rules';
  import {
    firstDir,
    groupByCategory,
    sortMeetings,
    type MeetingGroup,
    type SortDir,
    type SortKey,
  } from '../meetings/table';
  import { fieldErrors } from '../state/form';
  import { applyOwn, isOwnChange } from '../state/problems.svelte';
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
  // makes it stale, so it is closed. Settings-only changes (language, ...) and changes from this
  // view's cards (cadence, cycles) keep it.
  let signature = '';
  onMount(() => {
    const stop = [
      workspace.subscribe((ws) => {
        const next = JSON.stringify([ws.teams, ws.categories, ws.roles]);
        if (!isOwnChange() && next !== signature) editing = null;
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

  const commit = applyOwn;

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
  // ---------- sorting, grouping, ⋯ menu ----------

  let sortKey = $state<SortKey>('next');
  let sortDir = $state<SortDir>(1);
  let grouped = $state(false);

  function sortBy(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
    else {
      sortKey = key;
      sortDir = firstDir(key);
    }
  }
  // Without a rate there is no Cost column to sort by.
  $effect(() => {
    if (!rate && sortKey === 'cost') {
      sortKey = 'next';
      sortDir = 1;
    }
  });
  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none';

  const costOf = (e: CalEvent) =>
    rate && team ? meetingCost(team, e, effectiveDuration(e, team), rate) : 0;
  const weekCostOf = (e: CalEvent) => (team ? occurrencesPerWeek(e.rule, team) * costOf(e) : 0);

  const ordered = $derived(
    team
      ? sortMeetings(team.events, sortKey, sortDir, {
          next: (e) => next?.get(e.id),
          cost: costOf,
          locale: $locale,
        })
      : [],
  );
  const shorts = $derived(
    new Map(team?.events.map((e) => [e.id, ruleShort(e.rule, team, $t, $locale)]) ?? []),
  );

  /** Duplicate and Delete sit in a disclosure per row; one is open at a time. */
  let menuFor = $state<string | null>(null);
  const moreSelector = (id: string) => `[data-more="${CSS.escape(id)}"]`;

  async function toggleMenu(id: string) {
    menuFor = menuFor === id ? null : id;
    if (menuFor === null) return;
    await tick();
    root
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-menu-${id}`)} button:not(:disabled)`)
      ?.focus();
  }
  function onMenuKeydown(event: KeyboardEvent, id: string) {
    if (event.key !== 'Escape' || menuFor !== id) return;
    event.stopPropagation();
    menuFor = null;
    root?.querySelector<HTMLElement>(moreSelector(id))?.focus();
  }
  function onMenuFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    const wrap = event.currentTarget as HTMLElement;
    if (next && !wrap.contains(next)) menuFor = null;
  }
  function onWindowPointer(event: PointerEvent) {
    if (menuFor === null) return;
    const wrap = root?.querySelector(moreSelector(menuFor))?.parentElement;
    if (!wrap?.contains(event.target as Node)) menuFor = null;
  }

  const visible = $derived.by(() => {
    if (!team) return [];
    const q = query.trim().toLocaleLowerCase($locale);
    if (!q) return ordered;
    return ordered.filter((e) =>
      [
        e.name,
        categoryOf(e.categoryId)?.name ?? '',
        summaries.get(e.id) ?? '',
        shorts.get(e.id) ?? '',
        ...e.participants.map((p) => roleName(p.roleId)),
      ].some((text) => text.toLocaleLowerCase($locale).includes(q)),
    );
  });

  const groups = $derived<MeetingGroup[]>(
    grouped ? groupByCategory(visible, categories) : [{ category: undefined, events: visible }],
  );

  // ---------- form ----------

  /** A new meeting invites every role the team's members have, or the first role without members. */
  function blankEvent(): CalEvent {
    const first = roles[0];
    const memberRoles = roles.filter((r) => team?.members.some((m) => m.roleId === r.id));
    return {
      id: '',
      name: '',
      categoryId: categories[0]?.id ?? '',
      rule: { type: 'weekly', weekday: 1 },
      time: '09:00',
      duration: 60,
      participants:
        memberRoles.length > 0
          ? memberRoles.map((r) => ({ roleId: r.id, share: 1 }))
          : first
            ? [{ roleId: first.id, share: 1 }]
            : [],
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

  /** The rows in the order they are shown, groups included. */
  const shown = $derived(groups.flatMap((g) => g.events));

  function remove(event: CalEvent) {
    if (!team) return;
    const teamId = team.id;
    const at = shown.indexOf(event);
    const neighbour = shown[at + 1] ?? shown[at - 1];
    const result = commit((ws) => removeEvent(ws, teamId, event.id));
    if (!result.ok) return;
    if (editing?.event.id === event.id) editing = null;
    // The neighbour's Edit is disabled while a form is open; its ⋯ button never is.
    const id = neighbour ? CSS.escape(neighbour.id) : '';
    void focusSoon(
      neighbour ? `[data-edit="${id}"]:not(:disabled), [data-more="${id}"]` : '[data-add]',
    );
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="meetings stack" bind:this={root}>
  {#if !team}
    <p class="empty card">{$t('meet.none')}</p>
  {:else}
    <CadenceCard {team} />
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
        {#if team.events.length > 0}
          <label class="m-sort">
            <span class="sr-only">{$t('meet.sort')}</span>
            <select
              value={sortKey}
              onchange={(e) => {
                sortKey = e.currentTarget.value as SortKey;
                sortDir = firstDir(sortKey);
              }}
            >
              <option value="next">{$t('meet.sort.next')}</option>
              <option value="name">{$t('meet.sort.name')}</option>
              {#if rate}<option value="cost">{$t('meet.sort.cost')}</option>{/if}
            </select>
          </label>
          <button
            type="button"
            class="toggle"
            aria-pressed={grouped}
            onclick={() => (grouped = !grouped)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><path d="M4 6h16M4 12h10M4 18h10M17 15l3 3-3 3" /></svg
            >
            <span class="label">{$t('meet.group')}</span>
          </button>
        {/if}
        <button
          type="button"
          class="undo"
          data-tip={$t('meet.undo')}
          disabled={!$canUndo}
          onclick={() => workspace.undo()}
          ><svg viewBox="0 0 24 24" aria-hidden="true" class="m-only"
            ><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg
          ><span class="label">{$t('meet.undo')}</span></button
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
          <table class:grouped>
            <caption id="{uid}-caption" class="sr-only"
              >{$t('meet.table.caption', { team: team.name })}</caption
            >
            <thead>
              <tr>
                {#snippet sortable(key: SortKey, label: string, num = false)}
                  <th scope="col" class:num aria-sort={ariaSort(key)}>
                    <button
                      type="button"
                      class="sort"
                      class:active={sortKey === key}
                      onclick={() => sortBy(key)}
                    >
                      {label}
                      <svg viewBox="0 0 24 24" aria-hidden="true"
                        >{#if sortKey !== key}<path
                            d="M8 10l4-4 4 4M8 14l4 4 4-4"
                          />{:else if sortDir === 1}<path d="M8 14l4-4 4 4" />{:else}<path
                            d="M8 10l4 4 4-4"
                          />{/if}</svg
                      >
                    </button>
                  </th>
                {/snippet}
                {@render sortable('name', $t('meet.col.meeting'))}
                <th scope="col">{$t('meet.col.when')}</th>
                {@render sortable('next', $t('meet.col.next'))}
                {#if rate}
                  {@render sortable('cost', $t('meet.col.cost'), true)}
                {/if}
                <th scope="col">{$t('meet.col.participants')}</th>
                <th scope="col"><span class="sr-only">{$t('meet.col.actions')}</span></th>
              </tr>
            </thead>
            {#each groups as group, gi (group.category?.id ?? gi)}
              <tbody>
                {#if grouped}
                  {@const weekTotal = group.events.reduce((sum, e) => sum + weekCostOf(e), 0)}
                  <tr class="group">
                    <th scope="rowgroup" colspan="3">
                      <span class="group-name">
                        <span
                          class="dot"
                          style:background={group.category?.colour}
                          aria-hidden="true"
                        ></span>
                        {group.category?.name ?? '—'}
                        <span class="count"
                          >{$t(
                            group.events.length === 1
                              ? 'meet.group.count.one'
                              : 'meet.group.count.other',
                            { n: formatNumber($locale, group.events.length, 0) },
                          )}</span
                        >
                      </span>
                    </th>
                    {#if rate}
                      <td class="num cost group-cost">
                        {$t('meet.cost.week', { amount: euro(weekTotal) })}
                      </td>
                    {/if}
                    <td colspan="2"></td>
                  </tr>
                {/if}
                {#each group.events as event (event.id)}
                  {@const category = categoryOf(event.categoryId)}
                  {@const minutes = formatNumber($locale, effectiveDuration(event, team), 0)}
                  {@const cost = costOf(event)}
                  {@const when = next?.get(event.id)}
                  <tr class="row">
                    <th scope="row" class="c-name">
                      <span class="name">
                        <span class="bar" style:background={category?.colour} aria-hidden="true"
                        ></span>
                        <span>
                          <span class="title">{event.name}</span>
                          {#if !grouped}
                            <span class="sub">{category?.name ?? event.categoryId}</span>
                          {/if}
                        </span>
                      </span>
                    </th>
                    <td class="c-when" title={summaries.get(event.id)}>
                      <!-- The short text is for the eye; screen readers get the full rule. -->
                      <span class="when" aria-hidden="true">{shorts.get(event.id)}</span>
                      <span class="sr-only">{summaries.get(event.id)}</span>
                      <span class="sub"
                        >{event.time} · {$t(
                          event.scaling ? 'meet.duration.scaled' : 'meet.duration.fixed',
                          { n: minutes },
                        )}</span
                      >
                    </td>
                    <td class="next c-next">
                      <span class="m-label">{$t('meet.col.next')}</span>
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
                      <td class="num cost c-cost" data-cost={event.id}>
                        {euro(cost)}
                        {#if perWeek > 0}
                          <span class="sub"
                            >{$t('meet.cost.week', { amount: euro(perWeek * cost) })}</span
                          >
                        {:else if event.rule.type === 'once'}
                          <span class="sub">{$t('meet.cost.once')}</span>
                        {:else if event.rule.type === 'cycle-milestone'}
                          <span class="sub">{$t('meet.cost.milestone')}</span>
                        {/if}
                      </td>
                    {/if}
                    <td class="c-people">
                      <ul class="roles">
                        {#each event.participants as p, pi (pi)}
                          {@const name = roleName(p.roleId)}
                          {@const colour = roleOf(p.roleId)?.colour ?? '#4b5470'}
                          {@const label =
                            p.share < 1
                              ? $t('meet.role.share', {
                                  role: name,
                                  share: formatNumber($locale, p.share * 100, 0),
                                })
                              : name}
                          <!-- Focusable by tap but not by Tab, so a touch screen can show the name too. -->
                          <li class="role" class:part={p.share < 1} data-tip={label} tabindex="-1">
                            <span
                              class="ini"
                              style:background={colour}
                              style:color={inkOn(colour)}
                              aria-hidden="true">{initials(name)}</span
                            >
                            {#if p.share < 1}<span class="share" aria-hidden="true"
                                >{$t('meet.role.shareOnly', {
                                  share: formatNumber($locale, p.share * 100, 0),
                                })}</span
                              >{/if}
                            <span class="sr-only">{label}</span>
                          </li>
                        {/each}
                      </ul>
                    </td>
                    <td class="c-actions">
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
                        <!-- svelte-ignore a11y_no_static_element_interactions (Escape and focus leaving close the menu) -->
                        <div
                          class="menu-wrap"
                          onkeydown={(e) => onMenuKeydown(e, event.id)}
                          onfocusout={onMenuFocusout}
                        >
                          <button
                            type="button"
                            class="icon more"
                            data-more={event.id}
                            data-tip={$t('meet.more')}
                            aria-expanded={menuFor === event.id}
                            aria-controls="{uid}-menu-{event.id}"
                            aria-label={$t('meet.more.named', { name: event.name })}
                            onclick={() => toggleMenu(event.id)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" class="dots"
                              ><circle cx="5" cy="12" r="1.6" /><circle
                                cx="12"
                                cy="12"
                                r="1.6"
                              /><circle cx="19" cy="12" r="1.6" /></svg
                            >
                          </button>
                          <div
                            class="menu"
                            id="{uid}-menu-{event.id}"
                            hidden={menuFor !== event.id}
                          >
                            <button
                              type="button"
                              disabled={locked(event)}
                              aria-describedby={locked(event) ? 'meet-open-note' : undefined}
                              aria-label={$t('meet.duplicate.named', { name: event.name })}
                              onclick={() => {
                                menuFor = null;
                                duplicate(event);
                                void focusSoon(moreSelector(event.id));
                              }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true"
                                ><path d="M8 8h11v11H8zM5 16V5h11" /></svg
                              >
                              {$t('meet.duplicate')}
                            </button>
                            <button
                              type="button"
                              class="danger"
                              data-delete={event.id}
                              aria-label={$t('meet.delete.named', { name: event.name })}
                              onclick={() => {
                                menuFor = null;
                                remove(event);
                              }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true"
                                ><path
                                  d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"
                                /></svg
                              >
                              {$t('meet.delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
        <p class="empty status" role="status">
          {visible.length === 0 ? $t('meet.filter.none', { q: query.trim() }) : ''}
        </p>
      {/if}
    </div>
    <CyclesCard {team} />
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
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .role {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: 999px;
  }
  .role.part {
    padding-right: 0.5rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .ini {
    display: inline-grid;
    place-items: center;
    min-width: 1.85rem;
    height: 1.85rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 0 0 2px var(--surface);
  }
  .role::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 0.35rem);
    left: 50%;
    z-index: 3;
    translate: -50% 0;
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
  @media (hover: hover) {
    .role:hover::after {
      display: block;
    }
  }
  .role:focus::after {
    display: block;
  }
  .role:focus {
    outline: none;
  }
  .when {
    display: block;
    white-space: nowrap;
  }
  .c-when .sub {
    white-space: nowrap;
  }
  .m-label {
    display: none;
  }
  /* ---------- sortable headers ---------- */
  :global(#app) th .sort {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin: -0.3rem -0.4rem;
    padding: 0.3rem 0.4rem;
    min-height: 0;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    box-shadow: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }
  :global(#app) th .sort:hover {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  :global(#app) th .sort.active {
    color: var(--accent-text);
  }
  th .sort svg {
    width: 0.95rem;
    height: 0.95rem;
    opacity: 0.45;
  }
  th .sort.active svg {
    opacity: 1;
  }
  /* ---------- groups ---------- */
  :global(#app) tr.group > * {
    padding-top: 1.1rem;
    padding-bottom: 0.45rem;
    background: transparent;
    border-bottom: 1px solid var(--border-strong);
  }
  .group-name {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
  }
  .count {
    font-weight: 400;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .group-cost {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  /* ---------- toolbar extras ---------- */
  :global(#app) .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  :global(#app) .toggle[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .toolbar .m-only {
    display: none;
  }
  .m-sort {
    display: none;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  /* ---------- ⋯ menu ---------- */
  .menu-wrap {
    position: relative;
  }
  .dots {
    fill: currentColor;
    stroke: none;
  }
  :global(#app) .icons .icon.more[aria-expanded='true'] {
    background: var(--surface-2);
    color: var(--text);
  }
  .menu {
    position: absolute;
    top: calc(100% + 0.3rem);
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 11rem;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-lg, var(--shadow));
  }
  .icons .icon.more[aria-expanded='true']::after {
    display: none;
  }
  /* The table region scrolls, so the menus of the last rows open upwards to stay inside it. */
  tbody:last-child tr:nth-last-child(-n + 2) .menu {
    top: auto;
    bottom: calc(100% + 0.3rem);
  }
  .menu[hidden] {
    display: none;
  }
  :global(#app) .menu button {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-weight: 500;
    text-align: left;
  }
  :global(#app) .menu button:hover {
    background: var(--surface-2);
  }
  :global(#app) .menu button.danger {
    color: var(--danger);
  }
  :global(#app) .menu button.danger:hover {
    background: var(--danger-soft);
  }
  /* ---------- phones: each meeting becomes a card ---------- */
  @media (max-width: 40rem) {
    .m-sort {
      display: inline-flex;
      order: 4;
    }
    .group .count {
      display: none;
    }
    .toolbar .search {
      order: 3;
      flex: 1 1 100%;
    }
    .m-sort {
      flex: 1 1 auto;
    }
    .m-sort select {
      width: 100%;
    }
    :global(#app) .toolbar .toggle {
      order: 5;
    }
    /* Undo and grouping become icon buttons, so each row of the toolbar fits a phone. */
    :global(#app) .toolbar :is(.toggle, .undo) {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      padding: 0;
    }
    .toolbar :is(.toggle, .undo) .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .toolbar .m-only {
      display: block;
    }
    :global(#app) table:not([role='grid']) tr > *,
    :global(#app) table:not([role='grid']) tbody tr:hover > * {
      background: transparent;
    }
    .table-wrap {
      overflow: visible;
    }
    table,
    tbody {
      display: block;
    }
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    :global(#app) tr.group {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid var(--border-strong);
    }
    :global(#app) tr.group > * {
      display: block;
      padding: 1rem 0 0.4rem;
      border: 0;
    }
    :global(#app) tr.group > td:empty {
      display: none;
    }
    :global(#app) table tr.row {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'name actions'
        'when cost'
        'next people';
      column-gap: 0.75rem;
      row-gap: 0.4rem;
      padding: 0.85rem 0;
      border-bottom: 1px solid var(--border);
    }
    :global(#app) table tr.row > * {
      display: block;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .c-name {
      grid-area: name;
      align-self: center;
    }
    .c-actions {
      grid-area: actions;
    }
    .c-when {
      grid-area: when;
    }
    .c-cost {
      grid-area: cost;
    }
    .c-next {
      grid-area: next;
      align-self: center;
      font-size: 0.9rem;
    }
    .m-label {
      display: inline;
      font-weight: 400;
      color: var(--text-muted);
      margin-right: 0.3rem;
    }
    .c-people {
      grid-area: people;
      justify-self: end;
    }
    .roles {
      justify-content: flex-end;
    }
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
