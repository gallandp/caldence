<script module lang="ts">
  export interface DayItem {
    key: string;
    start: string;
    name: string;
    category: string;
    team: string;
    colour?: string;
    hours: number;
    skipped: boolean;
  }
</script>

<script lang="ts">
  import { formatNumber, locale, translate as t } from '../../i18n';

  let { items }: { items: DayItem[] } = $props();

  function meta(item: DayItem): string {
    return $t(item.skipped ? 'cal.item.metaSkipped' : 'cal.item.meta', {
      category: item.category,
      team: item.team,
      hours: $t('cal.hours', { hours: formatNumber($locale, item.hours, 1) }),
    });
  }
</script>

<ul>
  {#each items as item (item.key)}
    <li style:--c={item.colour ?? 'var(--border-strong)'}>
      <span class="time">{item.start}</span>
      <strong>{item.name}</strong>
      <span class="meta">{meta(item)}</span>
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  li {
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius);
    border-left: 4px solid var(--c);
    background: color-mix(in srgb, var(--c) 9%, var(--surface));
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    margin-right: 0.4rem;
    color: var(--text-muted);
  }
  .meta {
    display: block;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
</style>
