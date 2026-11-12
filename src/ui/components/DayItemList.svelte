<script module lang="ts">
  export interface DayItem {
    key: string;
    teamId: string;
    eventId: string;
    start: string;
    end: string;
    /** The meeting ends on the next day. */
    nextDay: boolean;
    name: string;
    /** Category, rule and (with several teams) the team, already joined for display. */
    about: string;
    /** The participating roles, comma separated; empty without participants. */
    roles: string;
    colour?: string;
    hours: number;
    skipped: boolean;
  }
</script>

<script lang="ts">
  import { formatNumber, locale, translate as t } from '../../i18n';

  interface Props {
    items: DayItem[];
    /** Opens the meeting in the Meetings view; without it there is no Edit button. */
    onedit?: (item: DayItem) => void;
  }
  let { items, onedit }: Props = $props();
</script>

<ul>
  {#each items as item (item.key)}
    <li style:--c={item.colour ?? 'var(--border-strong)'} class:skipped={item.skipped}>
      <span class="name"
        ><i class="dot" aria-hidden="true"></i><strong>{item.name}</strong><span class="hours"
          >{$t('cal.hours', { hours: formatNumber($locale, item.hours, 1) })}</span
        ></span
      >
      <span class="when"
        >{$t(item.nextDay ? 'cal.item.when.nextDay' : 'cal.item.when', {
          from: item.start,
          to: item.end,
        })}</span
      >
      <span class="meta">{item.about}</span>
      {#if item.roles}<span class="meta">{item.roles}</span>{/if}
      {#if item.skipped}<span class="meta note">{$t('cal.item.skipped')}</span>{/if}
      {#if onedit}
        <button
          type="button"
          class="edit"
          aria-label={$t('meet.edit.named', { name: item.name })}
          onclick={() => onedit(item)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg
          >
          {$t('meet.edit')}
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius);
    border-left: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 8%, var(--surface));
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--c);
  }
  .hours {
    margin-left: auto;
    padding-left: 0.5rem;
    font-size: 0.8rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .when {
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }
  .meta {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .note {
    font-weight: 600;
    color: var(--warn);
  }
  .skipped .when {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  :global(#app) .edit {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.75rem;
    font-size: 0.875rem;
  }
  .edit svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (forced-colors: active) {
    .dot {
      background: CanvasText;
    }
  }
</style>
