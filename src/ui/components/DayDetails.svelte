<script module lang="ts">
  export interface DayItem {
    key: string;
    start: string;
    name: string;
    category: string;
    team: string;
    hours: number;
    skipped: boolean;
  }
  export interface DayOverlap {
    key: string;
    a: string;
    teamA: string;
    b: string;
    teamB: string;
  }
</script>

<script lang="ts">
  import { formatDisplayDate, formatNumber, locale, translate as t } from '../../i18n';

  interface Props {
    date: string;
    items: DayItem[];
    overlaps: DayOverlap[];
    holiday?: string;
    onclose: () => void;
  }
  let { date, items, overlaps, holiday, onclose }: Props = $props();

  const uid = $props.id();
</script>

<section class="details" aria-labelledby="{uid}-title">
  <div class="head">
    <h3 id="{uid}-title">{formatDisplayDate($locale, date, 'long')}</h3>
    <button type="button" onclick={onclose}>{$t('cal.day.close')}</button>
  </div>
  {#if holiday}
    <p class="holiday">{$t('cal.day.holiday', { name: holiday })}</p>
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
    <ul>
      {#each items as item (item.key)}
        <li>
          <span class="time">{item.start}</span>
          <strong>{item.name}</strong>
          <span class="meta"
            >{$t('cal.item.meta', {
              category: item.category,
              team: item.team,
              hours: formatNumber($locale, item.hours, 1),
            })}{item.skipped ? ` (${$t('cal.item.skipped')})` : ''}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .details {
    margin-top: var(--space);
    padding: var(--space);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
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
  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  li {
    padding: 0.35rem 0;
    border-top: 1px solid var(--border);
  }
  .time {
    font-variant-numeric: tabular-nums;
    margin-right: 0.5rem;
  }
  .meta {
    display: block;
    color: var(--text-muted);
  }
</style>
