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
    onedit?: (item: DayItem) => void;
  }
  let { date, items, overlaps, holiday, onclose, onedit }: Props = $props();

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
    <button type="button" class="close" aria-label={$t('cal.day.close')} onclick={onclose}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
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
    <DayItemList {items} {onedit} />
  {/if}
</section>

<style>
  .details {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  h3:focus {
    outline: none;
  }
  :global(#app) .close {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    min-height: 0;
    padding: 0;
    color: var(--text-muted);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  :global(#app) .close:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .close svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  p {
    margin: 0;
  }
  .holiday {
    font-weight: 650;
    color: var(--danger);
  }
  .overlap {
    font-weight: 600;
  }
  .none {
    color: var(--text-muted);
  }
  @media (forced-colors: active) {
    .details {
      border: 2px solid CanvasText;
    }
  }
</style>
