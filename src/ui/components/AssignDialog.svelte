<script lang="ts">
  import { demandRows } from '../../core/demand';
  import { assign, freeFte } from '../../core/line';
  import { areaOf, type Demand, type Team, type Workspace } from '../../core/model';
  import { formatNumber, locale, translate as t } from '../../i18n';
  import { applyOwn } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';
  import ImpactCheck from './ImpactCheck.svelte';

  /**
   * Staffing a person on a product's demand (#320): "Person → Product" with an FTE stepper and
   * the effect check of the commitment before it is made. Assigning is always possible; the check
   * only tells what the hours leave after the product's meetings. It offers the people not in the
   * product yet, the ones with the demand's skill first.
   */
  let { team, demand, onclose }: { team: Team; demand: Demand; onclose: () => void } = $props();

  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined = $state();
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  const ws = $derived($workspace);
  const fte = (n: number) => formatNumber($locale, n, 1);
  const tenth = (n: number) => Math.round(n * 10) / 10;

  /** People not in the product yet: with the skill first, then by free FTE, then by name. */
  const choices = $derived.by(() => {
    const free = new Map(ws.people.map((p) => [p.id, freeFte(ws, p.id)]));
    const hasSkill = (id: string) =>
      demand.skillId !== undefined &&
      !!ws.people.find((p) => p.id === id)?.skillIds?.includes(demand.skillId);
    return ws.people
      .filter((p) => !team.members.some((m) => m.personId === p.id))
      .sort(
        (a, b) =>
          Number(hasSkill(b.id)) - Number(hasSkill(a.id)) ||
          free.get(b.id)! - free.get(a.id)! ||
          a.name.localeCompare(b.name, $locale),
      )
      .map((p) => ({ id: p.id, name: p.name, free: free.get(p.id)!, skill: hasSkill(p.id) }));
  });
  let picked = $state<string | undefined>(undefined);
  const personId = $derived(picked ?? choices[0]?.id);
  const person = $derived(ws.people.find((p) => p.id === personId));
  const free = $derived(personId ? freeFte(ws, personId) : 0);
  const open = $derived.by(() => {
    const row = demandRows(ws, team).find((r) => r.demand.id === demand.id);
    return Math.max(0, tenth(demand.fte - (row?.committed ?? 0)));
  });
  /** At most the free FTE, at least 0.1: an overbooked person can still be staffed. */
  const max = $derived(Math.max(0.1, Math.floor(free * 10 + 1e-9) / 10));

  let value = $state<number | null>(null);
  /** The open demand, but no more than the person has free. */
  const suggested = $derived(Math.max(0.1, Math.min(open > 0 ? open : 0.1, max)));
  const amount = $derived(value ?? suggested);
  const valid = $derived(Number.isFinite(amount) && amount >= 0.1 && amount <= max + 1e-9);
  const step = (d: number) =>
    (value = tenth(
      Math.min(max, Math.max(0.1, (Number.isFinite(amount) ? amount : suggested) + d)),
    ));

  const candidate = $derived.by((): Workspace | undefined => {
    if (!personId || !valid) return undefined;
    const r = assign(ws, { personId, teamId: team.id, demandId: demand.id, fte: tenth(amount) });
    return r.ok ? r.value[0] : undefined;
  });

  const platform = $derived(areaOf(ws, team.id)?.name);
  const what = $derived(
    demand.skillId
      ? (ws.skills?.find((s) => s.id === demand.skillId)?.name ?? '')
      : (ws.roles.find((r) => r.id === demand.roleId)?.name ?? ''),
  );
  const eyebrow = $derived(
    [platform, what, $t('assign.demand', { fte: fte(demand.fte) })].filter(Boolean).join(' · '),
  );

  function save(event: Event) {
    event.preventDefault();
    if (!personId || !valid) return;
    const id = personId;
    const n = tenth(amount);
    const result = applyOwn((w) => {
      const r = assign(w, { personId: id, teamId: team.id, demandId: demand.id, fte: n });
      return r.ok ? { ok: true, value: r.value[0] } : r;
    });
    if (result.ok) close();
  }

  function close() {
    dialog?.close();
    onclose();
  }

  function onCancel(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
</script>

<dialog
  bind:this={dialog}
  class="assign"
  aria-labelledby="{uid}-title"
  oncancel={onCancel}
  onkeydown={(e) => e.key === 'Escape' && e.stopPropagation()}
  data-assign-dialog
>
  <p class="eyebrow">{eyebrow}</p>
  <h2 id="{uid}-title">
    {$t('assign.title', { person: person?.name ?? '…', team: team.name })}
  </h2>
  {#if choices.length === 0}
    <p class="hint">{$t('assign.nobody', { team: team.name })}</p>
    <div class="actions">
      <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
    </div>
  {:else}
    <form novalidate onsubmit={save}>
      <div class="field">
        <label for="{uid}-person">{$t('assign.person')}</label>
        <select
          id="{uid}-person"
          value={personId}
          onchange={(e) => {
            picked = e.currentTarget.value;
            value = null;
          }}
        >
          {#each choices as c (c.id)}
            <option value={c.id}
              >{$t(c.free < 0 ? 'assign.option.over' : 'assign.option', {
                name: c.name,
                free: fte(Math.abs(c.free)),
              })}{c.skill ? ` · ${what}` : ''}</option
            >
          {/each}
        </select>
      </div>
      <div class="amount">
        <div class="stepper" role="group" aria-labelledby="{uid}-fte-l">
          <button
            type="button"
            aria-label={$t('assign.less')}
            disabled={amount <= 0.1 + 1e-9}
            onclick={() => step(-0.1)}>−</button
          >
          <label class="sr-only" id="{uid}-fte-l" for="{uid}-fte">{$t('assign.fte')}</label>
          <input
            id="{uid}-fte"
            type="number"
            min="0.1"
            {max}
            step="0.1"
            value={amount}
            aria-describedby="{uid}-free"
            aria-invalid={valid ? undefined : 'true'}
            onchange={(e) => {
              // On change, not on every key: a half-typed number is left alone; off the 0.1 grid snaps.
              const v = e.currentTarget.value;
              value = v.trim() === '' ? NaN : tenth(Number(v));
            }}
          />
          <span class="unit" aria-hidden="true">{$t('assign.fte')}</span>
          <button
            type="button"
            aria-label={$t('assign.more')}
            disabled={amount >= max - 1e-9}
            onclick={() => step(0.1)}>+</button
          >
        </div>
        <p class="free" id="{uid}-free">
          {$t(free < 0 ? 'assign.free.over' : 'assign.free', {
            name: person?.name ?? '',
            free: fte(Math.abs(free)),
          })}
          · {$t('assign.open', { fte: fte(open) })}
        </p>
      </div>
      {#if !valid}
        <p class="error" role="alert">{$t('assign.invalid', { max: fte(max) })}</p>
      {/if}

      {#if candidate && personId && person}
        <ImpactCheck
          ws={candidate}
          teamId={team.id}
          {personId}
          roleId={demand.roleId}
          name={person.name}
        />
      {/if}

      <div class="actions">
        <button type="button" onclick={close}>{$t('dialog.cancel')}</button>
        <button type="submit" class="primary" disabled={!candidate} data-assign-save
          >{$t('assign.save')}</button
        >
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(36rem, calc(100vw - 2 * var(--space)));
    max-height: calc(100dvh - 2 * var(--space));
    padding: calc(var(--space) * 1.5);
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, var(--radius));
    box-shadow: var(--shadow-lg);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .eyebrow {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  h2 {
    margin: 0.15rem 0 var(--space);
    font-size: 1.3rem;
    overflow-wrap: anywhere;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .amount {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .stepper {
    display: inline-flex;
    align-items: stretch;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  :global(#app) .stepper button,
  .stepper button {
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 0;
    border-radius: 0;
    background: var(--surface-2);
    color: var(--text);
    font-size: 1.2rem;
    cursor: pointer;
  }
  .stepper button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  :global(#app) .stepper input,
  .stepper input {
    width: 3.6rem;
    min-height: 2.75rem;
    padding: 0 0.25rem;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    text-align: right;
    font-weight: 650;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    background: var(--bg);
    color: var(--text);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .unit {
    display: grid;
    place-items: center;
    padding: 0 0.6rem 0 0.1rem;
    font-weight: 650;
  }
  .stepper:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .free {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .hint {
    color: var(--text-muted);
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
