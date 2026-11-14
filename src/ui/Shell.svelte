<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { translate as t } from '../i18n';
  import { APP_VERSION } from '../version';
  import LanguageSwitch from './LanguageSwitch.svelte';
  import ThemeSwitch from './ThemeSwitch.svelte';
  import TeamSwitcher from './TeamSwitcher.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import StartView from './views/StartView.svelte';
  import CalendarView from './views/CalendarView.svelte';
  import SetupDone from './components/SetupDone.svelte';
  import SetupWizard from './setup/SetupWizard.svelte';
  import MeetingsView from './views/MeetingsView.svelte';
  import LoadView from './views/LoadView.svelte';
  import TeamView from './views/TeamView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import TemplatesView from './views/TemplatesView.svelte';
  import ExchangeView from './views/ExchangeView.svelte';
  import HelpView from './views/HelpView.svelte';
  import { registerFileInput } from './state/picker';
  import { LEGAL_PAGES, hasLegalPage, type LegalPage } from './state/legal';
  import { activeTeamId, workspace } from './state/workspace';

  const { dirty } = workspace;
  const REPO_URL = 'https://github.com/gallandp/caldence';

  const views = [
    'calendar',
    'load',
    'meetings',
    'team',
    'templates',
    'settings',
    'exchange',
    'help',
  ] as const;
  type ViewId = (typeof views)[number];
  /** A thin divider starts a new group above these views (planning, workspace, help); the list
      itself stays one tablist for the arrow keys. */
  const groupBefore: ReadonlySet<ViewId> = new Set(['meetings', 'settings', 'help']);

  /** Simple line icons (24×24, stroke = currentColor). */
  const icons: Record<ViewId, string> = {
    calendar:
      'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4',
    load: 'M5 20V11M10 20V5M15 20v-7M20 20V8',
    meetings: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
    settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
    templates: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 16.5h7M16.5 13v7',
    exchange: 'M7 7h13l-4-4M17 17H4l4 4',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  };

  /** Views that follow the role/person filter; the others hide it. */
  const FILTERED: readonly ViewId[] = ['calendar', 'load'];
  let active = $state<ViewId>('calendar');
  /** Without teams the Calendar shows the start screen and the team bar steps aside. */
  const noTeams = $derived($workspace.teams.length === 0);
  /** Shown once in the calendar right after the wizard created the first team. */
  let setupDone = $state(false);

  // The operator's imprint and privacy page, if they are on the server next to the app.
  let legal = $state<LegalPage[]>([]);
  onMount(() => {
    void Promise.all(LEGAL_PAGES.map((page) => hasLegalPage(page))).then((found) => {
      legal = LEGAL_PAGES.filter((_, i) => found[i]);
    });
  });
  // A new, opened or restored workspace is not the one the card was about.
  const { version } = workspace;
  $effect(() => {
    void $version;
    setupDone = false;
  });
  let tabs: Record<string, HTMLButtonElement | undefined> = {};

  /** A meeting the Meetings view opens for editing once it is shown (Edit in the calendar). */
  let editRequest = $state<string | undefined>();

  function editMeeting(teamId: string, eventId: string) {
    activeTeamId.set(teamId);
    editRequest = eventId;
    select('meetings');
  }

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
  let planWizard: SetupWizard | undefined = $state();
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
    if (noTeams) return;
    await tick();
    select(active, true);
  }

  let main: HTMLElement | undefined;

  /** Narrow screens: the views, language, appearance and links fold into a menu. */
  let menuOpen = $state(false);
  let menuButton: HTMLButtonElement | undefined = $state();
  function pick(id: ViewId) {
    select(id);
    if (!menuOpen) return;
    menuOpen = false;
    main?.focus();
  }
  function onMenuKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menuOpen) return;
    menuOpen = false;
    menuButton?.focus();
  }

  function skip(event: Event) {
    event.preventDefault();
    main?.focus();
  }
</script>

<svelte:window onkeydown={onShortcut} onbeforeunload={onBeforeUnload} />

<a class="skip" href="#main" onclick={skip}>{$t('skip.link')}</a>

<div class="layout">
  <aside class="sidebar">
    <div class="glow" aria-hidden="true"></div>
    <header>
      <div class="brand">
        <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#8b7bff" /><stop offset="1" stop-color="#22c3ee" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
          <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6.5" y="8.5" width="19" height="17" rx="3.5" stroke-width="2" />
            <path d="M11.5 6v4.5M20.5 6v4.5" stroke-width="2" />
            <path d="M9 18.5h3.2l1.6-3.5 2.4 6.5 2-4.6 1 1.6H23" stroke-width="1.9" />
          </g>
        </svg>
        <h1>{$t('app.name')}</h1>
      </div>
      <button
        type="button"
        class="menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="side-nav"
        bind:this={menuButton}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d={menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg
        >
        <span class="sr-only">{$t('nav.menu')}:</span>
        <span>{$t('view.' + active)}</span>
      </button>
    </header>

    {#if !(active === 'calendar' && noTeams)}
      <TeamSwitcher onPlan={() => planWizard?.show()} />
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions (Escape closes the menu from any control in it) -->
    <div id="side-nav" class="side-nav" class:open={menuOpen} onkeydown={onMenuKeydown}>
      <div class="tabs" role="tablist" aria-orientation="vertical" aria-label={$t('nav.views')}>
        {#each views as id (id)}
          {#if groupBefore.has(id)}
            <div class="group" aria-hidden="true"></div>
          {/if}
          <button
            type="button"
            role="tab"
            id={'tab-' + id}
            aria-selected={active === id}
            aria-controls={'panel-' + id}
            tabindex={active === id ? 0 : -1}
            bind:this={tabs[id]}
            onclick={() => pick(id)}
            onkeydown={onKeydown}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[id]} /></svg>
            <span>{$t('view.' + id)}</span>
          </button>
        {/each}
      </div>

      <div class="side-foot">
        <div class="prefs">
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
        {#if legal.length > 0}
          <nav class="legal" aria-label={$t('legal.label')}>
            {#each legal as page (page)}
              <a href="./{page}.html">{$t('legal.' + page)}</a>
            {/each}
          </nav>
        {/if}
        <p class="source">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg
            >
            {$t('legal.source')}<span class="sr-only"> {$t('legal.source.hint')}</span>
          </a>
          <span class="license">{$t('legal.license')}</span>
          <span class="license">{$t('app.version', { version: APP_VERSION })}</span>
        </p>
      </div>
    </div>
  </aside>

  <div class="content">
    <WorkspaceBar bind:this={bar} filters={FILTERED.includes(active)} />
    <SetupWizard
      bind:this={planWizard}
      oncreated={() => {
        setupDone = true;
        void tick().then(() => select('calendar', true));
      }}
    />

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
          <h2 class:sr-only={id === 'calendar' && noTeams}>
            {$t('view.' + id)}
          </h2>
          <svelte:boundary>
            {#if id === 'calendar' && noTeams}
              <StartView
                onOpenFile={() => fromEmptyState(bar?.open())}
                onOpenExample={() => fromEmptyState(bar?.openExample())}
                onManual={() => select('help', true)}
                onCreated={() => {
                  setupDone = true;
                  void tick().then(() => select('calendar', true));
                }}
              />
            {:else if id === 'load' && noTeams}
              <section class="start">
                <h3>{$t('calendar.empty.title')}</h3>
                <p>{$t('calendar.empty.text')}</p>
                <button type="button" onclick={() => fromEmptyState(bar?.openExample())}
                  >{$t('start.example')}</button
                >
              </section>
            {:else if id === 'calendar'}
              {#if setupDone}
                <SetupDone
                  onMeetings={() => {
                    setupDone = false;
                    select('meetings', true);
                  }}
                  onShare={() => {
                    setupDone = false;
                    select('exchange', true);
                  }}
                  onClose={() => {
                    setupDone = false;
                    void tick().then(() => select('calendar', true));
                  }}
                />
              {/if}
              {#key $workspace.settings.horizon.from + $workspace.settings.horizon.to}
                <CalendarView
                  onOpenMeetings={() => select('meetings', true)}
                  shown={active === 'calendar'}
                  onEditMeeting={editMeeting}
                />
              {/key}
            {:else if id === 'load'}
              {#if active === 'load'}<LoadView />{/if}
            {:else if id === 'meetings'}
              {#if active === 'meetings'}<MeetingsView
                  edit={editRequest}
                  onEditOpened={() => (editRequest = undefined)}
                />{/if}
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
    gap: 1.1rem;
    padding: 1.25rem 0.875rem;
    box-sizing: border-box;
    isolation: isolate;
    background: var(--side-bg);
    color: var(--side-text);
    overflow-y: auto;
  }
  /* A soft glow that drifts slowly; it stands still for reduced motion. The wrapper clips it, so
     it never adds to the sidebar's scroll area. */
  .glow {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }
  .glow::before {
    content: '';
    position: absolute;
    inset: -40%;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(40% 24% at 40% 30%, rgb(139 123 255 / 0.3), transparent 72%),
      radial-gradient(34% 22% at 66% 58%, rgb(34 195 238 / 0.16), transparent 72%),
      radial-gradient(34% 20% at 38% 76%, rgb(124 92 255 / 0.14), transparent 72%);
    animation: glow 24s ease-in-out infinite alternate;
  }
  .glow::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(180deg, transparent 55%, rgb(7 9 20 / 0.55));
  }
  @keyframes glow {
    50% {
      transform: translate(6%, -5%) rotate(8deg) scale(1.08);
    }
    100% {
      transform: translate(-5%, 6%) rotate(-6deg) scale(1.04);
    }
  }
  .group {
    height: 1px;
    margin: 0.5rem 0.75rem;
    background: rgb(255 255 255 / 0.1);
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
    padding: 0.5rem 0.75rem;
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
    .glow {
      display: none;
    }
    /* The sidebar's light-on-dark colours are author colours; use the system's text colour.
       Links keep the system link colour. */
    .sidebar,
    .sidebar :global(*:not(a)) {
      color: CanvasText;
    }
    .sidebar :global(a) {
      color: LinkText;
    }
    [role='tab'][aria-selected='true'] {
      border: 2px solid Highlight;
      padding: calc(0.5rem - 2px) calc(0.75rem - 2px);
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
  }
  /* Wide screens: the menu wrapper adds no box, and its toggle is not needed. */
  .side-nav {
    display: contents;
  }
  :global(#app) .menu-toggle {
    display: none;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.5rem;
    padding: 0.35rem 0.8rem;
    border: 1px solid rgb(255 255 255 / 0.25);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    color: #fff;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }
  .menu-toggle svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  /* Stays on the dark header: the light hover of other buttons would hide its white text. */
  :global(#app) header button.menu-toggle:hover {
    background: rgb(255 255 255 / 0.14);
  }
  :global(#app) header button.menu-toggle[aria-expanded='true'] {
    border-color: rgb(255 255 255 / 0.45);
    background: rgb(255 255 255 / 0.2);
  }
  .menu-toggle:focus-visible {
    outline-color: #b9b0ff;
  }
  .side-foot {
    margin-top: auto;
    padding: 0 0.5rem;
  }
  /* Language and appearance share one quiet row; their labels are for screen readers. */
  .prefs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  :global(#app) .prefs :global(.options button) {
    width: 1.8rem;
  }
  .prefs :global(.theme) {
    margin-top: 0;
  }
  :global(:root #app) .prefs :global(select) {
    font-size: 0.85rem;
    min-height: 2rem;
    padding: 0.2rem 1.8rem 0.2rem 0.65rem !important;
    border-radius: 999px;
    background-position: right 0.6rem center;
    background-size: 0.85rem;
  }
  .legal,
  .source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 1rem;
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
  }
  .legal {
    padding-top: 0.9rem;
    border-top: 1px solid rgb(255 255 255 / 0.1);
  }
  .legal + .source {
    margin-top: 0.5rem;
  }
  .source:not(.legal + .source) {
    padding-top: 0.9rem;
    border-top: 1px solid rgb(255 255 255 / 0.1);
  }
  .source a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--side-text);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .source a:hover {
    color: #fff;
  }
  .source svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .license {
    white-space: nowrap;
    font-size: 0.75rem;
    color: rgb(195 199 222 / 0.75);
  }
  .legal a {
    color: var(--side-text);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .legal a:hover {
    color: #fff;
  }
  @media (forced-colors: active) {
    .source a,
    .source a:hover,
    .legal a,
    .legal a:hover {
      color: LinkText;
    }
    .license {
      color: CanvasText;
    }
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
    margin: 1.25rem 0 1rem;
    font-size: 1.75rem;
    font-weight: 780;
    letter-spacing: -0.025em;
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
      /* Still the containing block of the glow; the team actions may overlap the content. */
      position: relative;
      overflow: visible;
      z-index: 1;
      height: auto;
      gap: 0.75rem;
      padding: 0.75rem;
    }
    /* The views, language, appearance and links fold into a menu below the header. */
    :global(#app) .menu-toggle {
      display: inline-flex;
    }
    .side-nav {
      display: none;
    }
    .side-nav.open {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    [role='tab'][aria-selected='true']::before {
      left: -0.75rem;
    }
    /* In the menu, the selected view also keeps a mark that is not only colour (WCAG 1.4.11). */
    [role='tab'][aria-selected='true'] {
      text-decoration: underline;
      text-decoration-color: #b9b0ff;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.3em;
    }
    .side-foot {
      margin-top: 0;
    }
    main {
      padding: 0 1rem 2rem;
    }
  }
</style>
