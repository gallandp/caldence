<script lang="ts">
  import { translate as t } from '../../i18n';
  import { VIEW_ICONS } from '../viewIcons';
  import Icon from './Icon.svelte';
  import { GUIDES, MAP_VIEWS, REFERENCES, type TopicId } from './topics';

  /** The help's home page: tasks first, then the views at a glance, then reference topics. */
  let {
    onOpen,
    onOpenView,
  }: {
    onOpen: (id: TopicId) => void;
    onOpenView?: (view: (typeof MAP_VIEWS)[number]) => void;
  } = $props();
</script>

<section class="block" aria-labelledby="help-home-title">
  <h3 id="help-home-title" class="hero">{$t('help.home.title')}</h3>
  <p class="lead">{$t('help.home.lead')}</p>
  <ul class="guides">
    {#each GUIDES as g, i (g.id)}
      <li class:featured={i === 0}>
        <button type="button" class="card" data-topic={g.id} onclick={() => onOpen(g.id)}>
          <Icon path={g.icon} tint={g.tint} size={i === 0 ? 'lg' : 'md'} />
          <span class="text">
            <span class="title">{$t(`help.topic.${g.id}.title`)}</span>
            <span class="summary">{$t(`help.topic.${g.id}.summary`)}</span>
          </span>
          <span class="meta">{$t('help.home.steps', { n: g.steps?.length ?? 0 })}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<section class="block" aria-labelledby="help-map-title">
  <h3 id="help-map-title">{$t('help.map.title')}</h3>
  <ul class="map">
    {#each MAP_VIEWS as view (view)}
      <li>
        <button type="button" class="view" onclick={() => onOpenView?.(view)}>
          <span class="view-icon" aria-hidden="true"
            ><svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"><path d={VIEW_ICONS[view]} /></svg
            ></span
          >
          <span class="text">
            <span class="title">{$t('view.' + view)}</span>
            <span class="summary">{$t('help.map.' + view)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<section class="block" aria-labelledby="help-ref-title">
  <h3 id="help-ref-title">{$t('help.ref.title')}</h3>
  <ul class="list">
    {#each REFERENCES as r (r.id)}
      <li>
        <button type="button" class="row" data-topic={r.id} onclick={() => onOpen(r.id)}>
          <Icon path={r.icon} tint={r.tint} size="sm" />
          <span class="text">
            <span class="title">{$t(`help.topic.${r.id}.title`)}</span>
            <span class="summary">{$t(`help.topic.${r.id}.summary`)}</span>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .block + .block {
    margin-top: 2.25rem;
  }
  h3 {
    margin: 0 0 0.25rem;
  }
  :global(#app [role='tabpanel']) .hero {
    font-size: 1.6rem;
    letter-spacing: -0.02em;
  }
  .lead {
    margin: 0 0 1.25rem;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .guides {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr));
    gap: 0.85rem;
  }
  .guides .featured {
    grid-column: 1 / -1;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .title {
    font-weight: 650;
    color: var(--text);
  }
  .summary {
    font-weight: 400;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  /* Cards: whole card is the button. #app raises specificity above the global button style. */
  :global(#app) .card {
    /* No colour transition: a theme switch must not pass through low-contrast mixes. */
    transition: border-color 0.15s;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 1.1rem 1.1rem 1rem;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 1rem;
  }
  :global(#app) .card:hover {
    border-color: var(--accent);
    background: var(--surface);
  }
  .meta {
    margin-top: auto;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent-text);
  }
  :global(#app) .featured .card {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.4rem;
    background: linear-gradient(
      120deg,
      var(--accent-soft),
      color-mix(in srgb, var(--surface) 70%, var(--accent-soft))
    );
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .featured .text {
    flex: 1 1 14rem;
  }
  .featured .title {
    font-size: 1.15rem;
  }
  .featured .meta {
    margin: 0;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    color: var(--on-accent);
    background: var(--accent);
  }
  .map {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
    gap: 0.6rem;
    margin-top: 0.75rem;
  }
  :global(#app) .view {
    /* No colour transition: a theme switch must not pass through low-contrast mixes. */
    transition: border-color 0.15s;
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    width: 100%;
    height: 100%;
    padding: 0.8rem 0.9rem;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: none;
    font-size: 0.95rem;
  }
  :global(#app) .view:hover {
    border-color: var(--accent);
  }
  .view-icon {
    flex: none;
    width: 1.35rem;
    height: 1.35rem;
    margin-top: 0.05rem;
    color: var(--accent-text);
  }
  .view-icon svg {
    width: 100%;
    height: 100%;
  }
  .list {
    margin-top: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--border);
  }
  :global(#app) .row {
    /* No colour transition: a theme switch must not pass through low-contrast mixes. */
    transition: border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    padding: 0.75rem 1rem;
    text-align: left;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-size: 0.95rem;
  }
  :global(#app) .row:hover {
    background: var(--surface-2);
  }
  .row .text {
    flex: 1;
  }
  .chevron {
    color: var(--text-muted);
    font-size: 1.4rem;
    line-height: 1;
  }
  @media (max-width: 40rem) {
    :global(#app [role='tabpanel']) .hero {
      font-size: 1.35rem;
    }
    /* Phones: icon beside the text, so the list of tasks stays short. */
    :global(#app) .card,
    :global(#app) .featured .card {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 0.85rem;
      row-gap: 0.4rem;
      padding: 0.9rem 1rem;
    }
    .meta,
    .featured .meta {
      grid-column: 2;
      justify-self: start;
      margin: 0;
    }
  }
</style>
