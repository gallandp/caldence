<script lang="ts">
  import type { ISODate } from '../../core/date';
  import { isoWeek } from '../../core/date';
  import { unitName, units } from '../../core/model';
  import { weekdayRuns, type MeetingRef, type OverlapPair } from '../../core/views';
  import {
    formatDisplayDate,
    formatNumber,
    levels,
    locale,
    nextWeeks,
    translate as t,
  } from '../../i18n';
  import { weekdayShort } from '../meetings/rules';
  import { workspace } from '../state/workspace';

  /**
   * The overlaps of a scope in one unit (#445): how many meeting pairs overlap on how many days in
   * the window, then one line per pair with its rhythm, people and an example week. The area
   * Overview and Meeting load both show it, so they read the same.
   */
  interface Props {
    pairs: OverlapPair[];
    /** Weeks in the window. */
    weeks: number;
    /** Pairs shown at first; the rest are offered with a button. */
    limit?: number;
    /** Opens the calendar's week of `date` with the person chosen. */
    onOpen?: (personId: string, date: ISODate) => void;
    /** Opens the full list elsewhere (Meeting load) instead of showing it here. */
    onMore?: () => void;
  }
  let { pairs, weeks, limit = Infinity, onOpen, onMore }: Props = $props();

  /** Every pair, after "Show all" (a whole line can have thousands, #316 budget). */
  let showAll = $state(false);

  /** People named per pair; the rest are counted. */
  const NAMED = 3;

  const ws = $derived($workspace);
  const n = (x: number) => formatNumber($locale, x, 0);
  const days = $derived(new Set(pairs.flatMap((p) => p.dates)).size);
  const summary = $derived(
    pairs.length === 0
      ? $t('overlaps.none', { period: nextWeeks($t, $locale, weeks) })
      : $t('overlaps.summary', {
          period: nextWeeks($t, $locale, weeks),
          pairs: $t(pairs.length === 1 ? 'overlaps.pairs.one' : 'overlaps.pairs.other', {
            n: n(pairs.length),
          }),
          days: $t(days === 1 ? 'overlaps.days.one' : 'overlaps.days.other', { n: n(days) }),
        }),
  );
  const shown = $derived(showAll ? pairs : pairs.slice(0, limit));
  const hidden = $derived(pairs.length - shown.length);

  const unitById = $derived(new Map(units(ws).map((u) => [u.id, u])));
  const meeting = (m: MeetingRef) =>
    unitById.get(m.teamId)?.events.find((e) => e.id === m.eventId)?.name ?? m.eventId;
  const unit = (m: MeetingRef) => unitName(ws, m.teamId, $levels.org) || m.teamId;
  const nameById = $derived(new Map(ws.people.map((p) => [p.id, p.name])));
  const personName = (id: string) => nameById.get(id) ?? id;
  const list = $derived(new Intl.ListFormat($locale, { style: 'long', type: 'conjunction' }));

  function when(p: OverlapPair): string {
    const weekdays = weekdayRuns(p.weekdays)
      .map(([a, b]) =>
        a === b
          ? weekdayShort($locale, a)
          : `${weekdayShort($locale, a)}${b - a > 1 ? '–' : ', '}${weekdayShort($locale, b)}`,
      )
      .join(', ');
    return $t('overlaps.when', { weekdays, from: p.start, to: p.end });
  }

  function people(p: OverlapPair): string {
    const names = p.people.slice(0, NAMED).map(personName);
    const rest = p.people.length - names.length;
    if (rest > 0) names.push($t('overlaps.people.more', { n: n(rest) }));
    return list.format(names);
  }

  const dateLabel = (date: ISODate) => formatDisplayDate($locale, date, 'short');
  const openLabel = (p: OverlapPair) =>
    $t('load.openWeek', {
      week: `${$t('weeks.week', { n: n(isoWeek(p.first.date)) })}, ${dateLabel(p.first.date)}`,
      person: personName(p.first.personId),
    });
</script>

<div class="overlaps" class:found={pairs.length > 0} data-clashes>
  <p class="what">{summary}</p>
  {#if shown.length > 0}
    <ul>
      {#each shown as p (p.key)}
        <li data-clash>
          <span class="pair"
            >{$t('overlaps.pair', {
              a: meeting(p.a),
              unitA: unit(p.a),
              b: meeting(p.b),
              unitB: unit(p.b),
            })}</span
          >
          <span class="details"
            >{when(p)} · {people(p)} · {$t(
              p.dates.length === 1 ? 'overlaps.pair.days.one' : 'overlaps.pair.days.other',
              { n: n(p.dates.length) },
            )} · {$t('overlaps.example')}
            {#if onOpen}<button
                type="button"
                class="link"
                aria-label={openLabel(p)}
                title={openLabel(p)}
                onclick={() => onOpen(p.first.personId, p.first.date)}
                >{dateLabel(p.first.date)}</button
              >{:else}{dateLabel(p.first.date)}{/if}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
  {#if hidden > 0}
    {#if onMore}
      <p class="more">
        <button type="button" class="link" data-more-clashes onclick={onMore}
          >{$t(hidden === 1 ? 'overlaps.more.one' : 'overlaps.more.other', {
            n: n(hidden),
          })}</button
        >
      </p>
    {:else}
      <p class="more">
        <button type="button" class="secondary" data-all-clashes onclick={() => (showAll = true)}
          >{$t('load.overlaps.all', { n: n(pairs.length) })}</button
        >
      </p>
    {/if}
  {/if}
</div>

<style>
  .more {
    align-self: flex-start;
  }
  .overlaps {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text-muted);
  }
  .overlaps.found {
    background: var(--warn-soft);
    color: var(--text);
  }
  p {
    margin: 0;
  }
  .what {
    font-weight: 650;
  }
  .found .what::before {
    content: '⚠ ';
    color: var(--warn);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.5rem;
    overflow-wrap: anywhere;
  }
  .pair {
    font-weight: 600;
  }
  .details,
  .more {
    color: var(--text-muted);
  }
  :global(#app) .overlaps .link {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
</style>
