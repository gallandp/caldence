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
    <li>
      <span class="time">{item.start}</span>
      <strong>{item.name}</strong>
      <span class="meta">{meta(item)}</span>
    </li>
  {/each}
</ul>

<style>
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
