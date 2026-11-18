<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import HelpHome from '../help/HelpHome.svelte';
  import HelpTopic from '../help/HelpTopic.svelte';
  import { openTopic, topic, TOPICS, type Topic, type TopicId } from '../help/topics';

  /** Help: a home page of topics, and one topic at a time. */
  let { onOpenView }: { onOpenView?: (view: NonNullable<Topic['view']>) => void } = $props();

  const current = $derived($openTopic ? topic($openTopic) : null);

  // Leaving Help and coming back starts on the home page.
  onDestroy(() => openTopic.set(null));

  async function open(id: TopicId) {
    openTopic.set(id);
    await tick();
    document.getElementById('help-topic-title')?.focus();
  }

  async function back() {
    const from = $openTopic;
    openTopic.set(null);
    await tick();
    document.querySelector<HTMLElement>(`.help [data-topic="${from}"]`)?.focus();
  }

  /** Links between topics are `#help-<id>`: open the topic instead of jumping. */
  function onclick(event: MouseEvent) {
    const link = (event.target as Element).closest?.('a[href^="#help-"]');
    if (!link) return;
    const id = link.getAttribute('href')!.slice('#help-'.length) as TopicId;
    if (!TOPICS.some((t) => t.id === id)) return;
    event.preventDefault();
    void open(id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates clicks on links, which Enter also fires) -->
<div class="help" {onclick}>
  {#if current}
    <HelpTopic topic={current} onBack={back} {onOpenView} />
  {:else}
    <HelpHome onOpen={open} {onOpenView} />
  {/if}
</div>

<style>
  .help {
    min-width: 0;
  }
  .help :global(a) {
    color: var(--accent-text);
  }
  .help :global(h4) {
    margin: 1.25rem 0 0.5rem;
  }
  .help :global(.scroll) {
    overflow-x: auto;
  }
  .help :global(table) {
    border-collapse: collapse;
    width: 100%;
  }
  .help :global(th),
  .help :global(td) {
    border: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  .help :global(thead th) {
    background: var(--surface);
  }
  .help :global(kbd) {
    font-family: inherit;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: nowrap;
  }
</style>
