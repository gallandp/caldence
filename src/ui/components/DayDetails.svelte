<script module lang="ts">
  export interface DayOverlap {
    key: string;
    a: string;
    teamA: string;
    b: string;
    teamB: string;
  }
</script>

<script lang="ts">
  import { formatDisplayDate, locale, translate as t } from '../../i18n';
  import DayItemList, { type DayItem } from './DayItemList.svelte';

  interface Props {
    date: string;
    items: DayItem[];
    overlaps: DayOverlap[];
    holiday?: string;
    onclose: () => void;
  }
  let { date, items, overlaps, holiday, onclose }: Props = $props();

  const uid = $props.id();
  let heading: HTMLElement | undefined = $state();

  export function focus() {
    heading?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onclose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape closes the region) -->
<section class="details" aria-labelledby="{uid}-title" onkeydown={onKeydown}>
  <div class="head">
    <h3 id="{uid}-title" tabindex="-1" bind:this={heading}>
      {formatDisplayDate($locale, date, 'long')}
    </h3>
    <button type="button" onclick={onclose}>{$t('cal.day.close')}</button>
  </div>
  {#if holiday}
    <p class="holiday">{$t('cal.holiday', { name: holiday })}</p>
  {/if}
  {#each overlaps as o (o.key)}
    <p class="overlap">
      <span aria-hidden="true">⚠</span>
      {$t('cal.overlap', { a: o.a, teamA: o.teamA, b: o.b, teamB: o.teamB })}
    </p>
  {/each}
  {#if items.length === 0}
    <p class="none">{$t('cal.day.none')}</p>
  {:else}
    <DayItemList {items} />
  {/if}
</section>

<style>
  .details {
    position: sticky;
    top: 5rem;
    margin-top: 0;
    padding: 1.1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }
  h3 {
    font-size: 1rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.75rem;
    cursor: pointer;
  }
  .overlap {
    font-weight: 600;
  }
  .none {
    color: var(--text-muted);
  }
  h3:focus {
    outline: none;
  }
</style>
