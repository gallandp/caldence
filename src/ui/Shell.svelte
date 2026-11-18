<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { levels, translate as t } from '../i18n';
  import { APP_VERSION } from '../version';
  import TeamSwitcher from './TeamSwitcher.svelte';
  import AreaIcon from './components/AreaIcon.svelte';
  import AreaTeams from './components/AreaTeams.svelte';
  import { initials } from './avatar';
  import AreaView from './views/AreaView.svelte';
  import AreaOverview from './views/AreaOverview.svelte';
  import { loadWeek } from './state/focus';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import StartView from './views/StartView.svelte';
  import CalendarView from './views/CalendarView.svelte';
  import SetupDone from './components/SetupDone.svelte';
  import GroupHint from './components/GroupHint.svelte';
  import AreaDialog from './AreaDialog.svelte';
  import { areaReady, dismissGroupHint, groupHintDismissed } from './state/hints';
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
  import { activeTeamId, filter, workspace } from './state/workspace';
  import { exportRequest } from './state/exportScope';
  import { rail, setRail } from './state/sidebar';
  import { areaPage, currentView } from './state/view';
  import { presenting, stopPresenting } from './state/present';
  import WhatIfBar from './components/WhatIfBar.svelte';

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
  /** Phones: these four are tabs at the bottom, the others sit in the file bar's menu. */
  const primary: readonly ViewId[] = ['calendar', 'load', 'meetings', 'team'];
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
  /** The area's page has the area marker (layers), not the people of a team. */
  const AREA_ICON = 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4';
  const iconOf = (id: ViewId) => (id === 'team' && activeArea ? AREA_ICON : icons[id]);

  /** Presenting: the sidebar is unfolded for the list of teams and areas. */
  let pickOpen = $state(false);
  $effect(() => {
    void $activeTeamId;
    void $presenting;
    pickOpen = false;
  });

  /** While presenting only the views that show the plan stay; the rest is workspace editing. */
  const PRESENTED: ReadonlySet<ViewId> = new Set(['calendar', 'load', 'meetings', 'team']);
  const navViews = $derived($presenting ? views.filter((id) => PRESENTED.has(id)) : views);
  $effect(() => {
    if ($presenting && !PRESENTED.has(active)) select('calendar');
  });
  // Larger type for the projector, set on the root so every rem grows with it.
  $effect(() => {
    document.documentElement.classList.toggle('presenting', $presenting);
    return () => document.documentElement.classList.remove('presenting');
  });

  /** Views that follow the role/person filter; the others hide it. */
  const FILTERED: readonly ViewId[] = ['calendar', 'load'];
  let active = $state<ViewId>('calendar');
  /** Without teams the Calendar shows the start screen and the team bar steps aside. */
  const noTeams = $derived($workspace.teams.length === 0);
  /** An area is selected: views that work per team offer its teams instead. */
  const activeArea = $derived($workspace.areas.find((a) => a.id === $activeTeamId));
  /** With an area selected, the Team entry is the area's page and carries the upper level name. */
  const viewKey = (id: ViewId) => (id === 'team' && activeArea ? 'view.area' : `view.${id}`);
  /** Views whose numbers depend on the selected team or area name it above the headline. */
  const SCOPED: readonly ViewId[] = ['calendar', 'load', 'meetings', 'team'];
  const activeTeam = $derived($workspace.teams.find((x) => x.id === $activeTeamId));
  const scopeName = $derived(noTeams ? undefined : (activeArea ?? activeTeam)?.name);
  const level = $derived(activeArea ? $levels.area : $levels.team);
  /** The Team / area page is about the unit itself: its name is the headline, the level sits above (#312). */
  const scope = (id: ViewId) => (id === 'team' ? level : `${scopeName} · ${level}`);
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
    areaReady.set(undefined);
  });

  // Where the app is looking goes into the file on save (Q5) ...
  $effect(() => {
    currentView.set({ unit: $activeTeamId ?? undefined, page: active });
  });
  // ... and a file (or the autosave) opens there again. Unknown values are ignored.
  $effect(() => {
    void $version;
    untrack(() => {
      const saved = $workspace.view;
      const unit = saved?.unit;
      if (unit && [...$workspace.teams, ...$workspace.areas].some((u) => u.id === unit))
        activeTeamId.set(unit);
      areaPage.set(saved?.areaPage === 'overview' ? 'overview' : 'structure');
      const page = views.find((id) => id === saved?.page);
      if (page) select(page);
    });
  });
  /**
   * Two or more teams and no area yet: offer once per workspace to group them. Shown on the
   * Team page, where people build; someone who only reads a plan is not asked to change it.
   */
  const groupHint = $derived(
    $workspace.teams.length >= 2 &&
      $workspace.areas.length === 0 &&
      !$groupHintDismissed.includes($workspace.id),
  );
  let hintDialog: AreaDialog | undefined = $state();
  // A new area opens its page, where the "area is ready" card shows the next steps.
  $effect(() => {
    if ($areaReady) select('team');
  });
  let tabs: Record<string, HTMLButtonElement | undefined> = {};

  /** A meeting the Meetings view opens for editing once it is shown (Edit in the calendar). */
  let editRequest = $state<string | undefined>();
  /** A meeting the Meetings view scrolls to and highlights (a drill-in from the area overview). */
  let showRequest = $state<string | undefined>();

  function editMeeting(teamId: string, eventId: string) {
    activeTeamId.set(teamId);
    editRequest = eventId;
    select('meetings');
  }

  /**
   * A drill-in from the area overview remembers the area: its target view offers one click back
   * while it still shows that unit (#277). No history, just the last drill-in.
   */
  let back = $state<{ areaId: string; unit: string; view: ViewId } | null>(null);
  // Leaving the drill-in's unit or view ends it: coming back later shows no link.
  $effect(() => {
    if (back && (back.unit !== $activeTeamId || back.view !== active)) back = null;
  });
  const backArea = $derived(back ? $workspace.areas.find((a) => a.id === back?.areaId) : undefined);
  function drillIn(unit: string, view: ViewId) {
    if (activeArea) back = { areaId: activeArea.id, unit, view };
    activeTeamId.set(unit);
    select(view, true);
  }
  function backToArea(areaId: string) {
    back = null;
    activeTeamId.set(areaId);
    areaPage.set('overview');
    select('team', true);
  }

  /** A load cell in the area overview: Load for that team, showing that week. */
  function openLoad(teamId: string, monday: string) {
    // A person filter would hide the team's week.
    filter.set({ teamId });
    loadWeek.set({ teamId, monday });
    drillIn(teamId, 'load');
  }

  // Presenting: picking an area after a team opens its overview, not an empty view of the area.
  let lastUnit = untrack(() => $activeTeamId);
  $effect(() => {
    const unit = $activeTeamId;
    if (unit === lastUnit) return;
    lastUnit = unit;
    const area = $workspace.areas.find((a) => a.id === unit);
    if (!area || !untrack(() => $presenting)) return;
    // Calendar and Load show the area too; the area page and an empty meeting list move on.
    const now = untrack(() => active);
    if (now === 'team' || (now === 'meetings' && area.events.length === 0)) {
      areaPage.set('overview');
      select('team');
    }
  });

  /** The tab bar's buttons (phones). */
  let barTabs: Partial<Record<ViewId, HTMLButtonElement>> = {};
  const shown = (el: HTMLElement | undefined) => !!el && el.getClientRects().length > 0;

  /** With `focus`, the view's visible tab gets the focus; a view without one (phones) its content. */
  function select(id: ViewId, focus = false) {
    // A preselection for the export is only for the next visit right now.
    if (id !== 'exchange') exportRequest.set(null);
    active = id;
    if (!focus) return;
    const tab = [tabs[id], barTabs[id]].find(shown);
    (tab ?? main)?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const i = navViews.indexOf(active);
    const last = navViews.length - 1;
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
    select(navViews[target]!, true);
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

  /** The rail exists on wide screens only; narrow ones keep their menu and tab bar. */
  const wide = () => matchMedia('(min-width: 60.0625rem)').matches;

  /** True while the user types into a field, so a plain key there stays text. */
  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }

  function onShortcut(event: KeyboardEvent) {
    // "[" folds or unfolds the sidebar (as in many editors), outside fields and dialogs. On German,
    // French or Swiss keyboards "[" needs AltGr (Ctrl+Alt on Windows) or Option on a Mac: only a
    // real command modifier rules it out.
    // Escape ends presenting, unless something in front of the page (a dialog, a menu) takes it.
    if (event.key === 'Escape' && $presenting) {
      const target = event.target as HTMLElement | null;
      if (
        !event.defaultPrevented &&
        // A checkbox (Hide names) is not text: Escape still ends presenting there.
        !(typing(target) && !['checkbox', 'radio'].includes((target as HTMLInputElement).type)) &&
        !menuOpen &&
        // An open dialog, modal or not (the area person card), takes Escape first.
        !document.querySelector('dialog[open]') &&
        !target?.closest?.('dialog[open], .switcher .list, .switcher .menu, [aria-expanded="true"]')
      ) {
        event.preventDefault();
        stopPresenting();
      }
      return;
    }
    if (event.key === '[') {
      // The rail is fixed while presenting.
      if ($presenting) return;
      const altGr = event.getModifierState?.('AltGraph') || (event.ctrlKey && event.altKey);
      const command = event.metaKey || (event.ctrlKey && !altGr);
      const target = event.target as HTMLElement | null;
      if (
        !command &&
        !event.isComposing &&
        !event.repeat &&
        wide() &&
        !typing(target) &&
        !target?.closest?.('dialog[open], .switcher .list, .switcher .menu') &&
        !document.querySelector('dialog:modal')
      ) {
        event.preventDefault();
        setRail(!$rail);
      }
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    // A modal dialog has its own keys; the structure view's person card is not modal.
    if (event.repeat || document.querySelector('dialog:modal')) return;
    const key = event.key.toLowerCase();
    // Nothing is saved or opened while presenting: the what-ifs are not part of the file.
    if ($presenting && (key === 's' || key === 'o')) {
      event.preventDefault();
      return;
    }
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
      if (typing(target)) return; // the field's own undo
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

  /** Narrow screens: the views and links fold into a menu. */
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

<div
  class="layout"
  class:rail={($rail || $presenting) && !pickOpen}
  class:present={$presenting && !pickOpen}
>
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
        class="rail-toggle"
        data-no-present
        aria-pressed={$rail}
        aria-keyshortcuts="["
        title={$t($rail ? 'nav.rail.open' : 'nav.rail.close') + ' ([)'}
        onclick={() => setRail(!$rail)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4v16"
          /><path d={$rail ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} /></svg
        >
        <span class="sr-only">{$t('nav.rail')}</span>
      </button>
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
      <!-- In the rail the switcher is only its badge: a click unfolds the sidebar first, so the
           list of teams opens at full width. -->
      <div
        class="switch"
        onclickcapture={(event) => {
          if (!wide() || !(event.target as HTMLElement).closest('.pick')) return;
          // Presenting: the sidebar unfolds only while the list is open; the rail setting stays.
          if ($presenting) pickOpen = !pickOpen;
          else if ($rail) setRail(false);
        }}
        onfocusout={(event) => {
          const next = event.relatedTarget as Node | null;
          if (pickOpen && next && !(event.currentTarget as HTMLElement).contains(next))
            pickOpen = false;
        }}
      >
        <TeamSwitcher onPlan={() => planWizard?.show()} />
      </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions (Escape closes the menu from any control in it) -->
    <div id="side-nav" class="side-nav" class:open={menuOpen} onkeydown={onMenuKeydown}>
      <div class="tabs" role="tablist" aria-orientation="vertical" aria-label={$t('nav.views')}>
        {#each navViews as id (id)}
          {#if groupBefore.has(id) && !$presenting}
            <div class="group" aria-hidden="true"></div>
          {/if}
          <button
            type="button"
            role="tab"
            id={'tab-' + id}
            aria-selected={active === id}
            aria-controls={'panel-' + id}
            tabindex={active === id ? 0 : -1}
            title={$rail && !$presenting ? $t(viewKey(id)) : undefined}
            bind:this={tabs[id]}
            onclick={() => pick(id)}
            onkeydown={onKeydown}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconOf(id)} /></svg>
            <span class="tab-label"
              >{$t(id === 'meetings' && $presenting ? 'view.meetings.short' : viewKey(id))}</span
            >
          </button>
        {/each}
      </div>

      <div class="side-foot">
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
    <WorkspaceBar bind:this={bar} filters={FILTERED.includes(active)}>
      {#snippet menu(close)}
        <div class="more-group" aria-hidden="true"></div>
        {#each navViews.filter((id) => !primary.includes(id)) as id (id)}
          <button
            type="button"
            class="more-view"
            aria-current={active === id ? 'page' : undefined}
            onclick={() => {
              close();
              select(id);
              main?.focus();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconOf(id)} /></svg>
            {$t(viewKey(id))}
          </button>
        {/each}
        <div class="more-group" aria-hidden="true"></div>
        {#each legal as page (page)}
          <a class="more-link" href="./{page}.html">{$t('legal.' + page)}</a>
        {/each}
        <a class="more-link" href={REPO_URL} target="_blank" rel="noopener noreferrer"
          >{$t('legal.source')}<span class="sr-only"> {$t('legal.source.hint')}</span></a
        >
      {/snippet}
    </WorkspaceBar>
    <SetupWizard
      bind:this={planWizard}
      oncreated={() => {
        setupDone = true;
        void tick().then(() => select('calendar', true));
      }}
    />

    <AreaDialog
      bind:this={hintDialog}
      returnFocus={() => {
        const opener = document.querySelector<HTMLButtonElement>('.group-hint button.primary');
        if (opener) opener.focus();
        else select(active, true);
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
      {#if $presenting}<WhatIfBar />{/if}
      {#each views as id (id)}
        <div
          role="tabpanel"
          id={'panel-' + id}
          aria-labelledby={'tab-' + id}
          tabindex="0"
          hidden={active !== id}
        >
          {#if backArea && active === id}
            <button
              type="button"
              class="back link"
              data-no-print
              onclick={() => backToArea(backArea.id)}
              ><span aria-hidden="true">←</span>{$t('overview.back', {
                name: backArea.name,
              })}</button
            >
          {/if}
          {#if scopeName !== undefined && SCOPED.includes(id)}
            <p class="eyebrow" title={scope(id)}>
              {#if activeArea}
                <span class="mark area"><AreaIcon /></span>
              {:else}
                <span class="mark team" aria-hidden="true">{initials(scopeName)}</span>
              {/if}
              <span class="eyebrow-text">{scope(id)}</span>
            </p>
          {/if}
          <h2 class:sr-only={id === 'calendar' && noTeams}>
            {id === 'team' && scopeName !== undefined ? scopeName : $t(viewKey(id))}
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
            {:else if (id === 'load' || id === 'meetings' || id === 'team') && noTeams}
              <!-- The same way in as the start screen, from every view that needs a team. -->
              <section class="start">
                <h3>{$t('calendar.empty.title')}</h3>
                <p>{$t('calendar.empty.text')}</p>
                <div class="start-actions">
                  <button type="button" class="primary" onclick={() => planWizard?.show()}
                    >{$t('setup.open')}</button
                  >
                  <button
                    type="button"
                    class="secondary"
                    onclick={() => fromEmptyState(bar?.openExample())}>{$t('start.example')}</button
                  >
                </div>
              </section>
            {:else if id === 'team' && activeArea}
              {#if active === id}
                <AreaView area={activeArea} onMeetings={() => select('meetings', true)}>
                  {#snippet overview()}
                    {#if activeArea.teamIds.length === 0}
                      <AreaTeams area={activeArea} view="team" />
                    {/if}
                    <AreaOverview
                      area={activeArea}
                      onOpenLoad={openLoad}
                      onOpenMeeting={(unitId, eventId) => {
                        showRequest = eventId;
                        drillIn(unitId, 'meetings');
                      }}
                      onOpenUnit={(unitId) => drillIn(unitId, 'meetings')}
                    />
                  {/snippet}
                </AreaView>
              {/if}
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
                  show={showRequest}
                  onShown={() => (showRequest = undefined)}
                  onSetHours={activeArea ? () => select('team', true) : undefined}
                  onExport={() => select('exchange', true)}
                />{/if}
            {:else if id === 'team'}
              {#if active === 'team'}
                {#if groupHint}
                  <GroupHint
                    onGroup={() => hintDialog?.show()}
                    onDismiss={() => {
                      dismissGroupHint($workspace.id);
                      void tick().then(() => select('team', true));
                    }}
                  />
                {/if}
                <TeamView />
              {/if}
            {:else if id === 'settings'}
              {#if active === 'settings'}<SettingsView />{/if}
            {:else if id === 'templates'}
              {#if active === 'templates'}<TemplatesView
                  onOpenTeam={() => select('team', true)}
                />{/if}
            {:else if id === 'exchange'}
              {#if active === 'exchange'}<ExchangeView
                  onOpenMeetings={() => select('meetings', true)}
                  onOpenHelp={() => {
                    select('help');
                    void tick().then(() => document.getElementById('manual-ics')?.focus());
                  }}
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

<!-- Phones: the main views are one tap away at the bottom, in reach of the thumb (HIG tab bars). -->
<nav class="tabbar" aria-label={$t('nav.views')}>
  {#each primary as id (id)}
    <button
      type="button"
      aria-current={active === id ? 'page' : undefined}
      bind:this={barTabs[id]}
      onclick={() => select(id)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconOf(id)} /></svg>
      <span>{$t(id === 'meetings' ? 'view.meetings.short' : viewKey(id))}</span>
    </button>
  {/each}
</nav>

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
  .content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    /* The file bar fits its buttons to the room beside the sidebar, not to the window. */
    container: content / inline-size;
  }
  main {
    padding: var(--head-gap, 0) 2rem 2.5rem;
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
  /* Information, not a control: quiet text directly above the headline. Margin, line and gap
     fill the headline's 1.25rem top margin, so the headline stays level with the filters. */
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.25rem 0 0.125rem;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 0.875rem;
    color: var(--text-muted);
  }
  .eyebrow + h2 {
    margin-top: 0;
  }
  /* Back to the area overview after a drill-in (#277): stays in reach while the view scrolls to
     the row it points at. */
  :global(#app) button.back {
    position: sticky;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    top: 0.75rem;
    z-index: 3;
    width: fit-content;
    min-height: 2.75rem;
    margin: 1rem 0 0;
    padding: 0 1rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
  }
  :global(#app) button.back:hover {
    background: var(--accent-soft);
  }
  /* Narrow: the filters sit above, not beside the headline; give the line room below them. */
  @container (max-width: 55.99rem) {
    .eyebrow {
      margin-top: 0.75rem;
    }
  }
  .eyebrow-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 0.875rem;
    height: 0.875rem;
  }
  .mark.area {
    color: var(--area);
  }
  /* The switcher's team badge, small; initials stay at least 10 px and widen it if needed (#215). */
  .mark.team {
    width: auto;
    min-width: 0.875rem;
    box-sizing: border-box;
    padding: 0 0.15rem;
    border-radius: 0.3rem;
    background: linear-gradient(135deg, #8b7bff, #22c3ee);
    color: #fff;
    font-size: 0.625rem;
    font-weight: 750;
    line-height: 1;
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
  .start-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  /* The fold button: on the dark header, only on wide screens (narrow ones have the menu). */
  :global(#app) .rail-toggle {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    min-height: 0;
    padding: 0;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 0.6rem;
    background: rgb(255 255 255 / 0.04);
    box-shadow: none;
    color: var(--side-text);
    cursor: pointer;
  }
  :global(#app) header button.rail-toggle:hover {
    background: rgb(255 255 255 / 0.12);
    color: #fff;
  }
  .rail-toggle:focus-visible {
    outline-color: #b9b0ff;
  }
  .rail-toggle svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .switch {
    display: contents;
  }
  /* ---------- the rail: icons only, names as tooltips ---------- */
  @media (min-width: 60.0625rem) {
    .layout.rail {
      grid-template-columns: 4.75rem minmax(0, 1fr);
    }
    .rail .sidebar {
      padding: 1rem 0.6rem;
      align-items: stretch;
    }
    .rail header {
      flex-direction: column;
      gap: 0.75rem;
      padding: 0;
    }
    .rail h1 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* Only the badge of the selected team or area stays. */
    .rail .switch {
      display: block;
    }
    .rail .switch :global(.switcher) {
      justify-content: center;
      padding: 0.4rem;
    }
    /* The name stays for assistive technology; the button's tooltip shows it too. */
    :global(#app) .rail .switch :global(.switcher .text) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* The team actions come back with the unfolded sidebar. */
    :global(#app) .rail .switch :global(.switcher button.toggle) {
      display: none;
    }
    :global(#app) .rail .switch :global(.switcher button.pick) {
      flex: none;
    }
    .rail [role='tab'] {
      justify-content: center;
      padding: 0.6rem 0;
    }
    .rail [role='tab'] .tab-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .rail [role='tab'][aria-selected='true']::before {
      left: -0.6rem;
    }
    /* Keyboard focus shows the view's name next to the icon (a title appears only on hover). */
    .rail [role='tab']:focus-visible .tab-label {
      left: calc(100% + 0.6rem);
      top: 50%;
      z-index: 5;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      padding: 0.3rem 0.6rem;
      border-radius: 0.5rem;
      background: #1d1f3a;
      color: #fff;
      font-size: 0.85rem;
      transform: translateY(-50%);
      box-shadow: 0 4px 14px rgb(0 0 0 / 0.3);
    }
    .rail .sidebar:has([role='tab']:focus-visible) {
      overflow: visible;
    }
    @media (forced-colors: active) {
      .rail [role='tab'][aria-selected='true'] {
        padding: calc(0.6rem - 2px) 0;
      }
      .rail [role='tab']:focus-visible .tab-label {
        border: 1px solid CanvasText;
      }
    }
    .rail .group {
      margin-inline: 0.35rem;
    }
    .rail .side-foot {
      display: none;
    }
    /* Presenting: the rail names each view under its icon, so the room can follow (Q6). */
    .layout.present {
      grid-template-columns: 6.25rem minmax(0, 1fr);
    }
    .present [role='tab'] {
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.55rem 0.2rem;
    }
    .present [role='tab'] .tab-label,
    .present [role='tab']:focus-visible .tab-label {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      padding: 0;
      background: none;
      color: inherit;
      box-shadow: none;
      transform: none;
      font-size: 0.72rem;
      line-height: 1.15;
      text-align: center;
      white-space: normal;
    }
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
    /* The views and links fold into a menu below the header. */
    :global(#app) .menu-toggle {
      display: inline-flex;
    }
    :global(#app) .rail-toggle {
      display: none;
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
      padding: var(--head-gap, 0) 1rem 2rem;
    }
  }
  .tabbar {
    display: none;
  }
  @media (max-width: 40rem) {
    /* The tab bar and the file bar's menu replace the menu button. */
    :global(#app) .menu-toggle,
    .side-nav.open {
      display: none;
    }
    /* A field that Tab scrolls into view stops above the tab bar (WCAG 2.4.11). */
    :global(html) {
      scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
    }
    main {
      /* Room for the tab bar, so the end of a view is not hidden behind it. */
      padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
    }
    .tabbar {
      position: fixed;
      inset: auto 0 0;
      /* Below the person card's bottom sheet (20), which covers it like a modal would. */
      z-index: 15;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding: 0.3rem 0.25rem calc(0.3rem + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface) 88%, transparent);
      -webkit-backdrop-filter: blur(18px) saturate(1.6);
      backdrop-filter: blur(18px) saturate(1.6);
    }
    :global(#app) .tabbar button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      min-width: 0;
      min-height: 3.1rem;
      padding: 0.3rem 0.15rem;
      border: 0;
      border-radius: 0.75rem;
      background: transparent;
      box-shadow: none;
      color: var(--text-muted);
      font: inherit;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
    }
    .tabbar span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tabbar svg {
      width: 1.9rem;
      height: 1.5rem;
      padding: 0.1rem 0.6rem;
      border: 1.5px solid transparent;
      border-radius: 999px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
      box-sizing: content-box;
    }
    /* The current tab: accent colour and an outlined pill around its icon, a mark that is not
       only colour (WCAG 1.4.1), like the pressed view mode in the calendar. */
    :global(#app) .tabbar button[aria-current='page'] {
      color: var(--accent);
    }
    .tabbar [aria-current='page'] svg {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
  }
  @media (max-width: 40rem) and (forced-colors: active) {
    .tabbar [aria-current='page'] svg {
      border-color: Highlight;
    }
  }
  /* The views without a tab and the links, in the file bar's menu on phones. */
  .more-group,
  .more-view,
  .more-link {
    display: none;
  }
  @media (max-width: 40rem) {
    .more-group {
      display: block;
      height: 1px;
      margin: 0.25rem 0.5rem;
      background: var(--border);
    }
    :global(#app .content > .bar .more-panel) button.more-view {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    :global(#app .content > .bar .more-panel) button.more-view::before {
      content: none;
    }
    .more-view svg {
      width: 1rem;
      height: 1rem;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    :global(#app .content > .bar .more-panel) button.more-view[aria-current='page'] {
      font-weight: 700;
      color: var(--accent);
    }
    .more-link {
      display: flex;
      align-items: center;
      min-height: 2.5rem;
      padding: 0 0.7rem;
      color: var(--text);
      font-size: 0.9rem;
    }
  }
</style>
