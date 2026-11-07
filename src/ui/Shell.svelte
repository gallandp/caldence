<script lang="ts">
  import { translate as t } from '../i18n';
  import { APP_VERSION } from '../version';
  import LanguageSwitch from './LanguageSwitch.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import CalendarView from './views/CalendarView.svelte';
  import MeetingsView from './views/MeetingsView.svelte';
  import WeeksView from './views/WeeksView.svelte';
  import LoadView from './views/LoadView.svelte';
  import TeamView from './views/TeamView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import HelpView from './views/HelpView.svelte';
  import { workspace } from './state/workspace';

  const { dirty } = workspace;

  const views = [
    'calendar',
    'weeks',
    'load',
    'meetings',
    'team',
    'settings',
    'templates',
    'exchange',
    'help',
  ] as const;
  type ViewId = (typeof views)[number];

  let active = $state<ViewId>('calendar');
  let tabs: Record<string, HTMLButtonElement | undefined> = {};

  function select(id: ViewId, focus = false) {
    active = id;
    if (focus) tabs[id]?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const i = views.indexOf(active);
    const last = views.length - 1;
    const target: number | undefined =
      event.key === 'ArrowRight'
        ? i === last
          ? 0
          : i + 1
        : event.key === 'ArrowLeft'
          ? i === 0
            ? last
            : i - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    select(views[target]!, true);
  }

  let bar: WorkspaceBar | undefined;

  function onShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.repeat || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (key === 's') void (event.shiftKey ? bar?.saveAs() : bar?.save());
    else if (key === 'o' && !event.shiftKey) void bar?.open();
    else if (key === 'z' && !event.shiftKey) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      workspace.undo();
    } else return;
    event.preventDefault();
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!$dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  let main: HTMLElement | undefined;
  function skip(event: Event) {
    event.preventDefault();
    main?.focus();
  }
</script>

<svelte:window onkeydown={onShortcut} onbeforeunload={onBeforeUnload} />

<a class="skip" href="#main" onclick={skip}>{$t('skip.link')}</a>

<header>
  <div class="title">
    <h1>{$t('app.name')}</h1>
    <span class="version">{$t('app.version', { version: APP_VERSION })}</span>
  </div>
  <LanguageSwitch />
</header>

<WorkspaceBar bind:this={bar} />

<div class="tabs" role="tablist" aria-label={$t('nav.views')}>
  {#each views as id (id)}
    <button
      type="button"
      role="tab"
      id={'tab-' + id}
      aria-selected={active === id}
      aria-controls={'panel-' + id}
      tabindex={active === id ? 0 : -1}
      bind:this={tabs[id]}
      onclick={() => select(id)}
      onkeydown={onKeydown}
    >
      {$t('view.' + id)}
    </button>
  {/each}
</div>

<main id="main" tabindex="-1" bind:this={main}>
  {#each views as id (id)}
    <div
      role="tabpanel"
      id={'panel-' + id}
      aria-labelledby={'tab-' + id}
      tabindex="0"
      hidden={active !== id}
    >
      <h2>{$t('view.' + id)}</h2>
      {#if (id === 'calendar' || id === 'weeks' || id === 'load') && $workspace.teams.length === 0}
        <section class="start">
          <h3>{$t('calendar.empty.title')}</h3>
          <p>{$t('calendar.empty.text')}</p>
          <button type="button" onclick={() => bar?.openExample()}
            >{$t('calendar.empty.example')}</button
          >
        </section>
      {:else if id === 'calendar'}
        {#key $workspace.settings.horizon.from + $workspace.settings.horizon.to}
          <CalendarView onOpenMeetings={() => select('meetings', true)} />
        {/key}
      {:else if id === 'weeks'}
        {#if active === 'weeks'}<WeeksView onOpenMeetings={() => select('meetings', true)} />{/if}
      {:else if id === 'load'}
        {#if active === 'load'}<LoadView />{/if}
      {:else if id === 'meetings'}
        {#if active === 'meetings'}<MeetingsView />{/if}
      {:else if id === 'team'}
        {#if active === 'team'}<TeamView />{/if}
      {:else if id === 'settings'}
        {#if active === 'settings'}<SettingsView />{/if}
      {:else if id === 'help'}
        {#if active === 'help'}<HelpView />{/if}
      {:else}
        <p>{$t('view.soon')}</p>
      {/if}
    </div>
  {/each}
</main>

<style>
  .skip {
    position: absolute;
    left: var(--space);
    top: 0;
    transform: translateY(-120%);
    padding: 0.5rem 1rem;
    background: var(--bg);
    color: var(--text);
    border: 2px solid var(--focus);
    border-radius: var(--radius);
    z-index: 10;
    transition: transform 0.15s;
  }
  .skip:focus {
    transform: translateY(var(--space));
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
    padding: var(--space);
    border-bottom: 1px solid var(--border);
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  .version {
    color: var(--text-muted);
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    /* vertical padding keeps the focus ring (3px + 2px offset) from being clipped by overflow */
    padding: 0.5rem var(--space);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
  }
  [role='tab'] {
    font: inherit;
    color: var(--text-muted);
    background: transparent;
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 0.75rem 1rem;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s;
  }
  [role='tab'][aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  [role='tab']:hover {
    color: var(--text);
  }
  main {
    padding: var(--space);
  }
  main:focus {
    outline: none;
  }
  h2 {
    margin-top: 0;
  }
  .start button {
    font: inherit;
    color: var(--bg);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
