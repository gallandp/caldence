<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { duplicateEvent, removeEvent, upsertEvent } from '../../core/edit';
  import type { CalEvent } from '../../core/model';
  import { effectiveDuration } from '../../core/recurrence';
  import { validate } from '../../core/validate';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import ColourField, { PALETTE } from '../components/ColourField.svelte';
  import EventForm from '../components/EventForm.svelte';
  import ListEditor from '../components/ListEditor.svelte';
  import { ruleSummary } from '../meetings/rules';
  import { fieldErrors } from '../state/form';
  import { activeTeamId, workspace } from '../state/workspace';

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
      activeTeamId.subscribe(() => (editing = null)),
    ];
    return () => stop.forEach((fn) => fn());
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

  function remove(event: CalEvent, index: number) {
    if (!team) return;
    const teamId = team.id;
    const neighbour = team.events[index + 1] ?? team.events[index - 1];
    const result = commit((ws) => removeEvent(ws, teamId, event.id));
    if (!result.ok) return;
    if (editing?.event.id === event.id) editing = null;
    void focusSoon(neighbour ? `[data-edit="${CSS.escape(neighbour.id)}"]` : '[data-add]');
  }
</script>

<div class="meetings" bind:this={root}>
  {#if !team}
    <p class="empty">{$t('meet.none')}</p>
  {:else}
    <div class="toolbar">
      <button
        type="button"
        class="primary"
        data-add
        disabled={categories.length === 0}
        aria-describedby={categories.length === 0 ? 'meet-needs-category' : undefined}
        onclick={() => open(blankEvent(), 'add')}>{$t('meet.add')}</button
      >
      <button type="button" disabled={!$canUndo} onclick={() => workspace.undo()}
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
          <caption id="{uid}-caption">{$t('meet.table.caption', { team: team.name })}</caption>
          <thead>
            <tr>
              <th scope="col">{$t('meet.col.name')}</th>
              <th scope="col">{$t('meet.col.category')}</th>
              <th scope="col">{$t('meet.col.rule')}</th>
              <th scope="col">{$t('meet.col.time')}</th>
              <th scope="col">{$t('meet.col.duration')}</th>
              <th scope="col">{$t('meet.col.roles')}</th>
              <th scope="col">{$t('meet.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each team.events as event, i (event.id)}
              {@const category = categoryOf(event.categoryId)}
              {@const minutes = formatNumber($locale, effectiveDuration(event, team), 0)}
              <tr>
                <th scope="row">{event.name}</th>
                <td>
                  <span class="cat">
                    <span class="swatch" style:background={category?.colour} aria-hidden="true"
                    ></span>
                    {category?.name ?? event.categoryId}
                  </span>
                </td>
                <td>{ruleSummary(event.rule, team, $t, $locale)}</td>
                <td>{event.time}</td>
                <td>
                  {$t(event.scaling ? 'meet.duration.scaled' : 'meet.duration.fixed', {
                    n: minutes,
                  })}
                </td>
                <td>
                  {event.participants
                    .map((p) =>
                      $t('meet.roles.share', {
                        role: roleName(p.roleId),
                        share: formatNumber($locale, p.share * 100, 0),
                      }),
                    )
                    .join(', ')}
                </td>
                <td>
                  <div class="actions">
                    <button
                      type="button"
                      data-edit={event.id}
                      disabled={locked(event)}
                      aria-describedby={locked(event) ? 'meet-open-note' : undefined}
                      aria-label={$t('meet.edit.named', { name: event.name })}
                      onclick={() => open(event, event.id)}>{$t('meet.edit')}</button
                    >
                    <button
                      type="button"
                      disabled={locked(event)}
                      aria-describedby={locked(event) ? 'meet-open-note' : undefined}
                      aria-label={$t('meet.duplicate.named', { name: event.name })}
                      onclick={() => duplicate(event)}>{$t('meet.duplicate')}</button
                    >
                    <button
                      type="button"
                      aria-label={$t('meet.delete.named', { name: event.name })}
                      onclick={() => remove(event, i)}>{$t('meet.delete')}</button
                    >
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

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

<style>
  .meetings {
    max-width: 64rem;
  }
  .empty {
    color: var(--text-muted);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: var(--space);
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.75rem 0.4rem 0;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody th {
    font-weight: 600;
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
