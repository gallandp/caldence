<script lang="ts">
  import type { HolidayDrop } from '../../core/ics';
  import { formatDisplayDate, locale, translate as t } from '../../i18n';

  /**
   * A quiet one-line note on the meetings that public holidays leave out of the .ics export
   * (#341). The meetings and their dates unfold below it, each date a chip that opens its day in
   * the Calendar. Dates outside the planning horizon are plain chips: the Calendar does not show
   * them.
   */
  interface Props {
    drops: HolidayDrop[];
    /** Where the meetings go missing: the planning horizon's export or this export's file. */
    kind: 'meetings' | 'export';
    region: string;
    horizon: { from: string; to: string };
    onOpenDay?: (date: string) => void;
  }
  let { drops, kind, region, horizon, onOpenDay }: Props = $props();

  const linked = (d: string) => !!onOpenDay && d >= horizon.from && d <= horizon.to;

  const names = $derived(drops.flatMap((d) => d.names));
  const days = $derived(new Set(drops.flatMap((d) => d.dates)).size);
  const summary = $derived(
    $t(`holidayDrops.${names.length === 1 ? 'single' : 'many'}.${days === 1 ? 'one' : 'other'}`, {
      name: names[0] ?? '',
      meetings: names.length,
      days,
      region,
      where: $t(`holidayDrops.where.${kind}`),
    }),
  );

  /** "Fr., 25.12.2026": the weekday tells a Friday holiday from a Monday one at a glance. */
  const chip = (d: string) => {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat($locale, {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, day)));
  };
</script>

{#if drops.length > 0}
  <details class="holiday-drops">
    <summary>
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4M10 14l4 4M14 14l-4 4"
        /></svg
      >
      <span class="text">{summary} <span class="toggle">{$t('holidayDrops.toggle')}</span></span>
    </summary>
    <ul>
      {#each drops as drop (drop.dates.join())}
        {@const name = drop.names.join(', ')}
        <li>
          <span class="names">{name}</span>
          <span class="dates">
            <!-- A space between chips keeps copied text readable; the flex gap spaces them. -->
            {#each drop.dates as date, j (date)}
              {j > 0 ? ' ' : ''}{#if linked(date)}
                <button
                  type="button"
                  class="chip"
                  aria-label={$t('holidayDrops.show', {
                    name,
                    date: formatDisplayDate($locale, date, 'short'),
                  })}
                  onclick={(e) => {
                    // Not a click outside the day details this opens in the Calendar.
                    e.stopPropagation();
                    onOpenDay?.(date);
                  }}>{chip(date)}</button
                >
              {:else}
                <span class="chip">{chip(date)}</span>
              {/if}
            {/each}
          </span>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .holiday-drops {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: fit-content;
    max-width: 100%;
    min-height: 2.75rem;
    list-style: none;
    cursor: pointer;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .icon {
    flex: none;
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .text {
    min-width: 0;
    padding-block: 0.4rem;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--accent-text);
    font-weight: 600;
    white-space: nowrap;
  }
  .toggle::after {
    content: '';
    width: 0.38em;
    height: 0.38em;
    margin-top: -0.2em;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    transition: transform 0.15s ease;
  }
  .holiday-drops[open] .toggle::after {
    margin-top: 0.2em;
    transform: rotate(-135deg);
  }
  summary:hover .toggle {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  /* Names in one column, so the date chips of every row start at the same edge. */
  ul {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5rem 1rem;
    margin: 0.25rem 0 0.75rem;
    padding: 0 0 0 1.55rem;
    list-style: none;
  }
  li {
    display: grid;
    grid-column: span 2;
    grid-template-columns: subgrid;
    align-items: baseline;
  }
  .names {
    color: var(--text);
    font-weight: 600;
  }
  @media (max-width: 40rem) {
    ul {
      grid-template-columns: 1fr;
      padding-left: 0;
    }
    ul {
      gap: 0.85rem;
    }
    li {
      grid-column: auto;
      grid-template-columns: 1fr;
      gap: 0.35rem;
    }
  }
  .dates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global(#app) .holiday-drops button.chip {
    min-width: 0;
    min-height: 0;
    border: 0;
    background: var(--accent-soft);
    color: var(--accent-text);
    font: inherit;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
  }
  :global(#app) .holiday-drops button.chip:hover {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle::after {
      transition: none;
    }
  }
  @media (forced-colors: active) {
    .chip,
    :global(#app) .holiday-drops button.chip {
      border: 1px solid CanvasText;
    }
  }
  /* Paper has no disclosure: the dates print, open or closed. */
  @media print {
    .toggle {
      display: none;
    }
    .holiday-drops::details-content {
      content-visibility: visible;
      display: block;
    }
    ul {
      display: grid;
    }
  }
</style>
