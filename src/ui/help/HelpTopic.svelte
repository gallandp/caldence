<script lang="ts">
  import { translate as t } from '../../i18n';
  import { VIEW_ICONS } from '../viewIcons';
  import Accessibility from './Accessibility.svelte';
  import Areas from './Areas.svelte';
  import CalendarApps from './CalendarApps.svelte';
  import Files from './Files.svelte';
  import Icon from './Icon.svelte';
  import Keyboard from './Keyboard.svelte';
  import { label, shortcut } from './label';
  import LoadCalc from './LoadCalc.svelte';
  import LoadFormula from './LoadFormula.svelte';
  import Paras from './Paras.svelte';
  import Rich from './Rich.svelte';
  import Templates from './Templates.svelte';
  import type { ManualControl, Topic } from './topics';
  import Where from './Where.svelte';

  /** One help topic: a guide with numbered steps, or a reference page. */
  let {
    topic,
    onBack,
    onOpenView,
  }: {
    topic: Topic;
    onBack: () => void;
    onOpenView?: (view: NonNullable<Topic['view']>) => void;
  } = $props();

  /** Paragraphs a guide folds under "Good to know". */
  const MORE: Partial<Record<Topic['id'], string[]>> = {
    start: ['help.first.other', 'help.first.areas'],
    calendar: [
      'help.views.export',
      'help.ics.areas',
      'help.ics.remember',
      'help.ics.holidays',
      'help.ics.place',
      'help.ics.note',
      'help.views.import',
    ],
    meetings: ['help.views.meetings', 'help.views.rules', 'help.views.day'],
    load: ['help.views.load', 'help.views.filters'],
    present: ['help.files.present', 'help.files.print'],
    team: ['help.views.team', 'help.views.split', 'help.templates.people'],
    settings: [
      'help.views.settings',
      'help.region.title',
      'help.region.intro',
      'help.region.import',
      'help.region.remove',
      'help.region.warn',
    ],
    views: [
      'help.views.intro',
      'help.views.areas',
      'help.views.phone',
      'help.views.filters',
      'view.calendar',
      'help.views.calendar',
      'help.views.calendar.legend',
      'help.views.day',
      'help.views.weeks',
    ],
  };

  /** The view icon a tab chip shows, for controls that name a view. */
  const viewIcon = (c: ManualControl) =>
    c.role === 'tab' && c.name.startsWith('view.')
      ? VIEW_ICONS[c.name.slice(5) as keyof typeof VIEW_ICONS]
      : undefined;

  const hasMore = $derived(
    topic.kind === 'guide' &&
      (MORE[topic.id] !== undefined || ['areas', 'files'].includes(topic.id)),
  );
</script>

<article class="topic" aria-labelledby="help-topic-title">
  <button type="button" class="back" onclick={onBack}>
    <span aria-hidden="true">‹</span>
    {$t('help.back')}
  </button>

  <header>
    <Icon path={topic.icon} tint={topic.tint} size="lg" />
    <div>
      <h3 id="help-topic-title" class="title" tabindex="-1">
        {$t(`help.topic.${topic.id}.title`)}
      </h3>
      <p class="summary">{$t(`help.topic.${topic.id}.summary`)}</p>
    </div>
  </header>

  {#if topic.steps}
    <ol class="steps" data-manual-steps>
      {#each topic.steps as step, i (step.text + i)}
        <li
          data-control-role={step.control?.role}
          data-control-name={step.control ? $label(step.control.name) : undefined}
        >
          <span class="num" aria-hidden="true">{i + 1}</span>
          <div class="body">
            <p>
              <Rich
                key={step.text}
                labels={{ ...step.labels, ...(step.control ? { control: step.control.name } : {}) }}
                keys={{ esc: $shortcut('present') }}
              />
            </p>
            {#if step.control}
              {@const icon = viewIcon(step.control)}
              <span class="chip {step.control.role}" aria-hidden="true">
                {#if icon}<svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d={icon} />
                  </svg>{:else if step.control.role === 'radio'}<span class="dot"></span>{/if}
                {$label(step.control.name)}
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  {#if topic.id === 'calendar'}<CalendarApps />{/if}
  {#if topic.id === 'load' || topic.id === 'calc'}<div class="figure"><LoadFormula /></div>{/if}

  {#if topic.view}
    {@const view = topic.view}
    <p class="go">
      <button type="button" class="primary" onclick={() => onOpenView?.(view)}>
        {$t('help.open', { view: $t('view.' + view) })}
      </button>
    </p>
  {/if}

  {#if hasMore}
    <details class="more">
      <summary>{$t('help.more')}</summary>
      <div class="more-body">
        {#if MORE[topic.id]}<Paras keys={MORE[topic.id]!} />{/if}
        {#if topic.id === 'areas'}<Areas />{/if}
        {#if topic.id === 'files'}<Files />{/if}
      </div>
    </details>
  {:else if topic.kind === 'reference'}
    <div class="reference">
      {#if MORE[topic.id]}<Paras keys={MORE[topic.id]!} />{/if}
      {#if topic.id === 'templates'}<Templates />{/if}
      {#if topic.id === 'calc'}<LoadCalc />{/if}
      {#if topic.id === 'where'}<Where />{/if}
      {#if topic.id === 'keys'}<Keyboard />{/if}
      {#if topic.id === 'a11y'}<Accessibility />{/if}
    </div>
  {/if}
</article>

<style>
  .topic {
    max-width: 46rem;
  }
  :global(#app) .back {
    transition: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0 0 1.25rem -0.5rem;
    padding: 0.35rem 0.6rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 600;
  }
  :global(#app) .back:hover {
    background: var(--accent-soft);
  }
  .back span {
    font-size: 1.35rem;
    line-height: 1;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  h3 {
    margin: 0;
  }
  :global(#app [role='tabpanel']) h3.title {
    font-size: 1.6rem;
    letter-spacing: -0.02em;
    scroll-margin-top: 1rem;
  }
  .summary {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }
  .steps li {
    position: relative;
    display: flex;
    gap: 0.9rem;
    padding-bottom: 1.1rem;
  }
  /* The line that joins the numbers, as in a timeline. */
  .steps li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 0.95rem;
    top: 2.1rem;
    bottom: 0.15rem;
    width: 2px;
    background: var(--border);
  }
  .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .body {
    min-width: 0;
    padding-top: 0.2rem;
  }
  .body p {
    margin: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.45rem;
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 1px 2px rgb(15 20 38 / 0.08);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .chip.tab {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .chip svg {
    width: 1rem;
    height: 1rem;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 4px solid var(--accent);
    background: var(--surface);
  }
  .figure {
    margin-top: 0.5rem;
  }
  .go {
    margin: 1.5rem 0 0;
  }
  .more {
    margin-top: 1.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .more summary {
    padding: 0.8rem 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .more-body {
    padding: 0 1rem 0.5rem;
    color: var(--text);
  }
  .reference {
    margin-top: 1rem;
  }
  @media (max-width: 40rem) {
    header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }
    :global(#app [role='tabpanel']) h3.title {
      font-size: 1.35rem;
    }
  }
</style>
