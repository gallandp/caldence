<script lang="ts">
  import type { Area, OwnerHalf, OwnerMode, Team } from '../../core/model';
  import { ownerMode, ownerRole, ownerSlots, setOwnerMode } from '../../core/owners';
  import { translate as t } from '../../i18n';
  import { PALETTE } from './ColourField.svelte';
  import FieldError from './FieldError.svelte';
  import OwnerAvatar from './OwnerAvatar.svelte';
  import { Problems } from '../state/problems.svelte';
  import { workspace } from '../state/workspace';

  /**
   * The owner set-up of a product (team) or platform (area), #331: a tandem of business and
   * technical owner, or deliberately only one. Switching to one half keeps the other person as a
   * member, so switching back restores them. A missing wanted owner is assigned through the unit's
   * own "add person" form, with the owner role chosen (`onAssign`).
   */
  let {
    unit,
    level,
    onAssign,
  }: { unit: Team | Area; level: 'team' | 'area'; onAssign: (roleId: string) => void } = $props();

  const uid = $props.id();
  const problems = new Problems(uid);
  const { commit } = problems;

  const ws = $derived($workspace);
  const mode = $derived(ownerMode(unit));
  const slots = $derived(ownerSlots(ws, unit));
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const roleName = (half: OwnerHalf) => $t(`owner.role.${level}.${half}`);
  const MODES: OwnerMode[] = ['both', 'business', 'technical'];

  function choose(next: OwnerMode) {
    if (next !== mode) commit('mode', '', (w) => setOwnerMode(w, unit.id, next));
  }

  /** Finds or creates the owner role of this half, then hands over to the unit's add form. */
  function assign(half: OwnerHalf) {
    let roleId = '';
    const done = commit('mode', '', (w) => {
      const colour = PALETTE[w.roles.length % PALETTE.length]!.hex;
      const [next, id] = ownerRole(w, half, level, roleName(half), colour);
      roleId = id;
      return { ok: true, value: next };
    });
    if (done) onAssign(roleId);
  }
</script>

<section class="card owners" aria-labelledby="{uid}-h" data-owner-card>
  <div class="head">
    <h3 id="{uid}-h">{$t(`owner.heading.${level}`)}</h3>
    <div class="segmented" role="group" aria-label={$t('owner.mode.label')} data-no-present>
      {#each MODES as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => choose(m)}
          >{$t(`owner.mode.${m}`)}</button
        >
      {/each}
    </div>
  </div>
  <p class="hint">{$t('owner.hint')}</p>
  <ul>
    {#each slots as s (s.half)}
      {#each s.personIds as id (id)}
        <li>
          <OwnerAvatar name={personName(id)} half={s.half} large />
          <span class="tx"><b>{personName(id)}</b><small>{roleName(s.half)}</small></span>
        </li>
      {:else}
        <li class="missing">
          <OwnerAvatar name={null} half={s.half} large />
          <span class="tx"><b>{$t('owner.missing')}</b><small>{roleName(s.half)}</small></span>
          <button
            type="button"
            class="secondary"
            data-no-present
            aria-label={$t('owner.assign.label', { role: roleName(s.half) })}
            onclick={() => assign(s.half)}>{$t('owner.assign')}</button
          >
        </li>
      {/each}
    {/each}
  </ul>
  {#if mode !== 'both'}
    <p class="hint">{$t(`owner.kept.${mode}`)}</p>
  {/if}
  <FieldError {problems} id="mode" />
</section>

<style>
  /* Full width in a card grid: the owners sit in one row above the members. */
  .owners {
    grid-column: 1 / -1;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  h3 {
    margin: 0;
  }
  /* On a phone the three choices share one full-width row instead of wrapping. */
  @media (max-width: 40rem) {
    :global(#app) .owners .segmented {
      display: flex;
      flex-wrap: nowrap;
      width: 100%;
    }
    :global(#app) .owners .segmented button {
      flex: auto;
      padding-inline: 0.5rem;
      white-space: nowrap;
    }
  }
  .hint {
    margin: 0.5rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 2.5rem;
    margin: 0.85rem 0 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.75rem;
  }
  .tx {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tx small {
    color: var(--text-muted);
  }
  .missing b {
    color: var(--danger);
  }
</style>
