<script lang="ts">
  import { areaOf, linePeople, type LineUnit } from '../../core/model';
  import { levels, translate as t } from '../../i18n';
  import { initials } from '../avatar';
  import { workspace } from '../state/workspace';

  /**
   * Meetings & cadence for a line unit (#316): meetings belong to products, so the view lists the
   * products its people are in and leads there.
   */
  let { unit, onOpen }: { unit: LineUnit; onOpen: (teamId: string) => void } = $props();

  const rows = $derived.by(() => {
    const ws = $workspace;
    const people = linePeople(ws, unit.id);
    return ws.teams.flatMap((team) => {
      const mine = new Set(
        team.members.filter((m) => people.has(m.personId)).map((m) => m.personId),
      ).size;
      return mine > 0 ? [{ team, area: areaOf(ws, team.id)?.name, mine }] : [];
    });
  });
</script>

<section class="line-products" aria-labelledby="line-products-title">
  <h3 id="line-products-title">{$t('line.products.title', { teams: $levels.teams })}</h3>
  <p class="hint">{$t('line.products.hint', { teams: $levels.teamsLc })}</p>
  {#if rows.length === 0}
    <p class="empty">{$t('line.products.none', { teams: $levels.teamsLc })}</p>
  {:else}
    <ul>
      {#each rows as row (row.team.id)}
        <li>
          <button type="button" onclick={() => onOpen(row.team.id)}>
            <span class="badge" aria-hidden="true">{initials(row.team.name)}</span>
            <span class="text">
              <span class="name">{row.team.name}</span>
              <span class="meta"
                >{[
                  row.area,
                  $t(row.mine === 1 ? 'line.products.mine.one' : 'line.products.mine.other', {
                    n: row.mine,
                  }),
                  $t(
                    row.team.events.length === 1
                      ? 'line.products.meetings.one'
                      : 'line.products.meetings.other',
                    { n: row.team.events.length },
                  ),
                ]
                  .filter(Boolean)
                  .join(' · ')}</span
              >
            </span>
            <span class="go" aria-hidden="true">→</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.05rem;
  }
  .hint,
  .empty {
    margin: 0 0 var(--space);
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
    gap: 0.6rem;
  }
  :global(#app) .line-products button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 3.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font-weight: 500;
    text-align: start;
    box-shadow: none;
  }
  :global(#app) .line-products button:hover {
    background: var(--surface-2);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.55rem;
    background: linear-gradient(135deg, #8b7bff, #22c3ee);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 750;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .name {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .go {
    color: var(--text-muted);
  }
</style>
