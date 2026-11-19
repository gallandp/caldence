<script lang="ts">
  import type { Area, Team } from '../../core/model';
  import { ownerMode, ownerSlots } from '../../core/owners';
  import { translate as t } from '../../i18n';
  import OwnerAvatar from './OwnerAvatar.svelte';
  import { workspace } from '../state/workspace';

  /**
   * The wanted owners of a team or area (#331): an avatar with initials and a small F or T badge
   * per owner, a dashed "?" for a missing one. With `names`, their names follow, and in single
   * mode a note such as "(nur technisch)". Renders nothing in files without tandem roles.
   */
  let { unit, names = false }: { unit: Team | Area; names?: boolean } = $props();

  const ws = $derived($workspace);
  const slots = $derived(ownerSlots(ws, unit));
  const mode = $derived(ownerMode(unit));
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const label = $derived(
    slots
      .map((s) =>
        $t('owner.slot', {
          half: $t(`owner.half.${s.half}`),
          names: s.personIds.map(personName).join(', ') || $t('owner.missing'),
        }),
      )
      .join('; '),
  );
  const shown = $derived(
    slots
      .flatMap((s) => s.personIds)
      .map(personName)
      .join(' · '),
  );
</script>

{#if slots.length > 0}
  <span class="owners" role="img" aria-label={label}>
    {#each slots as s (s.half)}
      {#each s.personIds as id (id)}
        <OwnerAvatar name={personName(id)} half={s.half} />
      {:else}
        <OwnerAvatar name={null} half={s.half} />
      {/each}
    {/each}
    {#if names && (shown || mode !== 'both')}
      <span class="names" aria-hidden="true"
        >{shown}{#if mode !== 'both'}
          <small>{$t(`owner.only.${mode}`)}</small>{/if}</span
      >
    {/if}
  </span>
{/if}

<style>
  .owners {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .names {
    overflow: hidden;
    margin-left: 0.15rem;
    color: var(--text);
    font-size: 0.85rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .names small {
    color: var(--text-muted);
  }
</style>
