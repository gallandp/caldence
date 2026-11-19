<script lang="ts">
  import type { HolidayDrop } from '../../core/ics';
  import { formatDisplayDate, locale, translate as t } from '../../i18n';

  /**
   * One line naming the meetings that public holidays leave out of the .ics export, each date a
   * link to that day in the Calendar (#341). Dates outside the planning horizon are plain text:
   * the Calendar does not show them.
   */
  interface Props {
    drops: HolidayDrop[];
    /** The words before the list, already translated. */
    lead: string;
    horizon: { from: string; to: string };
    onOpenDay?: (date: string) => void;
  }
  let { drops, lead, horizon, onOpenDay }: Props = $props();

  const linked = (d: string) => !!onOpenDay && d >= horizon.from && d <= horizon.to;
</script>

{#snippet day(name: string, date: string)}
  {@const short = formatDisplayDate($locale, date, 'short')}
  {#if linked(date)}
    <button
      type="button"
      class="link"
      aria-label={$t('holidayDrops.show', { name, date: short })}
      onclick={() => onOpenDay?.(date)}>{short}</button
    >
  {:else}
    {short}
  {/if}
{/snippet}

{#if drops.length > 0}
  <p class="holiday-drops">
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4M10 14l4 4M14 14l-4 4"
      /></svg
    >
    <span>
      {lead}
      {#each drops as drop, i (drop.name)}
        {i > 0 ? $t('holidayDrops.sep') : ''}<span class="drop"
          >{drop.name}
          {#each drop.dates as date, j (date)}
            {j > 0 ? ', ' : ''}{@render day(drop.name, date)}
          {/each}
        </span>
      {/each}
    </span>
  </p>
{/if}

<style>
  .holiday-drops {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  svg {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    margin-top: 0.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .drop {
    color: var(--text);
  }
  :global(#app) .holiday-drops button.link {
    min-height: 0;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-text);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
</style>
