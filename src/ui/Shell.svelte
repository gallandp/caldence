<script lang="ts">
  import { tick } from 'svelte';
  import { translate as t } from '../i18n';
  import { APP_VERSION } from '../version';
  import LanguageSwitch from './LanguageSwitch.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import StartView from './views/StartView.svelte';
  import CalendarView from './views/CalendarView.svelte';
  import MeetingsView from './views/MeetingsView.svelte';
  import WeeksView from './views/WeeksView.svelte';
  import LoadView from './views/LoadView.svelte';
  import TeamView from './views/TeamView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import TemplatesView from './views/TemplatesView.svelte';
  import ExchangeView from './views/ExchangeView.svelte';
  import HelpView from './views/HelpView.svelte';
  import { registerFileInput } from './state/picker';
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

  /** Simple line icons (24×24, stroke = currentColor). */
  const icons: Record<ViewId, string> = {
    calendar:
      'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4',
    weeks: 'M4 5h16M4 10h16M4 15h16M4 20h10',
    load: 'M5 20V11M10 20V5M15 20v-7M20 20V8',
    meetings: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
    settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
    templates: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 16.5h7M16.5 13v7',
    exchange: 'M7 7h13l-4-4M17 17H4l4 4',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  };

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
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? i === last
          ? 0
          : i + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
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
  let fileInput: HTMLInputElement | undefined;
  $effect(() => (fileInput ? registerFileInput(fileInput) : undefined));

  /** Blurs the focused control so that a commit-on-blur value is in the workspace before saving. */
  function commitFocused(): HTMLElement | null {
    const field = document.activeElement;
    if (!(field instanceof HTMLElement) || field === document.body) return null;
    field.blur();
    return field;
  }

  function onShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.repeat || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      const field = commitFocused();
      void (event.shiftKey ? bar?.saveAs() : bar?.save());
      // The save has taken its snapshot by now; give the field its focus back.
      field?.focus();
    } else if (key === 'o' && !event.shiftKey) {
      commitFocused();
      void bar?.open();
    } else if (key === 'z' && !event.shiftKey) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return; // the field's own undo
      // A form or an open meeting draft would be closed as stale by the undo: do nothing.
      if (target?.closest('form') || document.querySelector('.eventform')) {
        event.preventDefault();
        return;
      }
      workspace.undo();
    } else return;
    event.preventDefault();
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!$dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  /**
   * Runs a file action from an empty state. When it loaded a workspace, the empty state with the
   * focused button is gone: the focus moves to the current tab instead of the page (WCAG 2.4.3).
   */
  async function fromEmptyState(action: Promise<void> | undefined) {
    await action;
    if ($workspace.teams.length === 0) return;
    await tick();
    select(active, true);
  }

  let main: HTMLElement | undefined;
  function skip(event: Event) {
    event.preventDefault();
    main?.focus();
  }
</script>

<svelte:window onkeydown={onShortcut} onbeforeunload={onBeforeUnload} />

<a class="skip" href="#main" onclick={skip}>{$t('skip.link')}</a>

<div class="layout">
  <aside class="sidebar">
    <header>
      <div class="brand">
        <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#8b7bff" /><stop offset="1" stop-color="#22c3ee" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
          <path
            d="M9 12h14M9 17h9M9 22h5"
            stroke="#fff"
            stroke-width="2.6"
            stroke-linecap="round"
          />
        </svg>
        <h1>{$t('app.name')}</h1>
      </div>
      <span class="version">{$t('app.version', { version: APP_VERSION })}</span>
    </header>

    <div class="tabs" role="tablist" aria-orientation="vertical" aria-label={$t('nav.views')}>
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
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[id]} /></svg>
          <span>{$t('view.' + id)}</span>
        </button>
      {/each}
    </div>

    <div class="side-foot"><LanguageSwitch /></div>
  </aside>

  <div class="content">
    <WorkspaceBar bind:this={bar} />

    <input
      bind:this={fileInput}
      type="file"
      accept=".json,application/json"
      aria-label={$t('file.input')}
      tabindex="-1"
      hidden
    />

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
          <svelte:boundary>
            {#if id === 'calendar' && $workspace.teams.length === 0}
              <StartView
                onOpenFile={() => fromEmptyState(bar?.open())}
                onOpenExample={() => fromEmptyState(bar?.openExample())}
                onEmpty={() => select('team', true)}
                onManual={() => select('help', true)}
                onCreated={() => void tick().then(() => select('calendar', true))}
              />
            {:else if (id === 'weeks' || id === 'load') && $workspace.teams.length === 0}
              <section class="start">
                <h3>{$t('calendar.empty.title')}</h3>
                <p>{$t('calendar.empty.text')}</p>
                <button type="button" onclick={() => fromEmptyState(bar?.openExample())}
                  >{$t('calendar.empty.example')}</button
                >
              </section>
            {:else if id === 'calendar'}
              {#key $workspace.settings.horizon.from + $workspace.settings.horizon.to}
                <CalendarView onOpenMeetings={() => select('meetings', true)} />
              {/key}
            {:else if id === 'weeks'}
              {#if active === 'weeks'}<WeeksView
                  onOpenMeetings={() => select('meetings', true)}
                />{/if}
            {:else if id === 'load'}
              {#if active === 'load'}<LoadView />{/if}
            {:else if id === 'meetings'}
              {#if active === 'meetings'}<MeetingsView />{/if}
            {:else if id === 'team'}
              {#if active === 'team'}<TeamView />{/if}
            {:else if id === 'settings'}
              {#if active === 'settings'}<SettingsView />{/if}
            {:else if id === 'templates'}
              {#if active === 'templates'}<TemplatesView
                  onOpenTeam={() => select('team', true)}
                />{/if}
            {:else if id === 'exchange'}
              {#if active === 'exchange'}<ExchangeView
                  onOpenMeetings={() => select('meetings', true)}
                />{/if}
            {:else if id === 'help'}
              {#if active === 'help'}<HelpView />{/if}
            {:else}
              <p>{$t('view.soon')}</p>
            {/if}
            <!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
            {#snippet failed(_error, reset)}
              <section class="failed" role="alert">
                <p>{$t('view.failed')}</p>
                <button type="button" onclick={reset}>{$t('view.retry')}</button>
              </section>
            {/snippet}
          </svelte:boundary>
        </div>
      {/each}
    </main>
  </div>
</div>

<style>
  .skip {
    position: absolute;
    left: var(--space);
    top: 0;
    transform: translateY(-120%);
    padding: 0.5rem 1rem;
    background: var(--surface);
    color: var(--text);
    border: 2px solid var(--focus);
    border-radius: var(--radius);
    z-index: 10;
    transition: transform 0.15s;
  }
  .skip:focus {
    transform: translateY(var(--space));
  }
  .layout {
    display: grid;
    grid-template-columns: 15.5rem minmax(0, 1fr);
    min-height: 100vh;
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.25rem 0.875rem;
    box-sizing: border-box;
    background:
      radial-gradient(120% 60% at 0% 0%, rgb(139 123 255 / 0.22), transparent 60%),
      radial-gradient(90% 50% at 100% 100%, rgb(34 195 238 / 0.14), transparent 60%), var(--side-bg);
    color: var(--side-text);
    overflow-y: auto;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.5rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .logo {
    width: 2rem;
    height: 2rem;
    flex: none;
    filter: drop-shadow(0 4px 12px rgb(124 108 255 / 0.45));
  }
  h1 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #fff;
  }
  .version {
    white-space: nowrap;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: var(--side-text);
  }
  .tabs {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0;
  }
  [role='tab'] {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font: inherit;
    font-size: 0.925rem;
    font-weight: 500;
    color: var(--side-text);
    background: transparent;
    border: 0;
    border-radius: 0.65rem;
    padding: 0.6rem 0.75rem;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition:
      background-color 0.15s,
      color 0.15s;
  }
  [role='tab'] svg {
    width: 1.2rem;
    height: 1.2rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  [role='tab']:hover {
    background: rgb(255 255 255 / 0.06);
    color: #fff;
  }
  [role='tab'][aria-selected='true'] {
    color: #fff;
    font-weight: 600;
    background: linear-gradient(90deg, rgb(139 123 255 / 0.32), rgb(139 123 255 / 0.08));
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
  }
  [role='tab'][aria-selected='true']::before {
    content: '';
    position: absolute;
    left: -0.875rem;
    top: 0.5rem;
    bottom: 0.5rem;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: linear-gradient(#8b7bff, #22c3ee);
  }
  [role='tab'][aria-selected='true'] svg {
    stroke: #b9b0ff;
  }
  [role='tab']:focus-visible {
    outline-color: #b9b0ff;
  }
  /* Forced colours drop the gradient and the shadow: mark the selected view with a border and an underline. */
  @media (forced-colors: active) {
    [role='tab'][aria-selected='true'] {
      border: 2px solid Highlight;
      padding: calc(0.6rem - 2px) calc(0.75rem - 2px);
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
  }
  .side-foot {
    margin-top: auto;
    padding: 0 0.5rem;
  }
  .side-foot :global(.lang) {
    color: var(--side-text);
    font-size: 0.85rem;
  }
  .side-foot :global(select) {
    color: #fff !important;
    background-color: rgb(255 255 255 / 0.08) !important;
    border-color: rgb(255 255 255 / 0.35) !important;
  }
  .side-foot :global(option) {
    color: #000;
  }
  .content {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  main {
    padding: 0 2rem 2.5rem;
  }
  main:focus {
    outline: none;
  }
  h2 {
    margin: 0.25rem 0 1.25rem;
    font-size: 1.75rem;
    font-weight: 750;
    letter-spacing: -0.025em;
  }
  h2::after {
    content: '';
    display: block;
    width: 2.5rem;
    height: 4px;
    margin-top: 0.4rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #7b6bff, #22b5e0);
  }
  .start {
    padding: 2.5rem;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(80% 120% at 100% 0%, rgb(139 123 255 / 0.18), transparent 60%), var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  .start h3 {
    margin-top: 0;
    font-size: 1.35rem;
  }
  @media (max-width: 60rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .sidebar {
      position: static;
      height: auto;
      gap: 0.75rem;
      padding: 0.75rem;
    }
    .tabs {
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }
    [role='tab'] {
      white-space: nowrap;
    }
    [role='tab'][aria-selected='true']::before {
      display: none;
    }
    .side-foot {
      margin-top: 0;
    }
    main {
      padding: 0 1rem 2rem;
    }
  }
</style>
