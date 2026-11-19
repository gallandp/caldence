<script lang="ts">
  import type { SetupMode } from '../../core/setup';
  import { translate as t } from '../../i18n';
  import SetupWizard from '../setup/SetupWizard.svelte';
  import { AREA_ICON, LINE_ICON, ORG_ICON } from '../viewIcons';

  let {
    onOpenFile,
    onOpenExample,
    onOpenLineExample,
    onManual,
    onCreated,
  }: {
    onOpenFile: () => void;
    onOpenExample: () => void;
    /** The large line organisation example (#323). */
    onOpenLineExample: () => void;
    /** Switches to Help. */
    onManual: () => void;
    /** The wizard created a team, an area, the organisation or line teams. */
    onCreated: (mode: SetupMode) => void;
  } = $props();

  const uid = $props.id();
  let wizard: SetupWizard | undefined;

  /**
   * Who starts (#387): each role sets up its own level of the same organisation, in the level's
   * colour of the app. The product owner gets the team wizard.
   */
  const ROLES: { key: string; mode: SetupMode; icon: string; tone: string }[] = [
    { key: 'line', mode: 'line', icon: LINE_ICON, tone: 'line' },
    { key: 'area', mode: 'area', icon: AREA_ICON, tone: 'area' },
    {
      key: 'po',
      mode: 'team',
      icon: 'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
      tone: 'team',
    },
    { key: 'coach', mode: 'org', icon: ORG_ICON, tone: 'org' },
  ];

  const folder =
    'M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z';
  const org =
    'M9.5 3.5h5v4h-5zM3.5 16.5h5v4h-5zM9.5 16.5h5v4h-5zM15.5 16.5h5v4h-5zM12 7.5v4.5M6 16.5V12h12v4.5';
  const sparkle =
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z';

  // Decorative week: [column, row, rows tall, hue] per meeting chip.
  const chips: [number, number, number, 'violet' | 'cyan' | 'pink' | 'amber'][] = [
    [0, 0, 1, 'violet'],
    [1, 0, 1, 'violet'],
    [2, 0, 1, 'violet'],
    [3, 0, 1, 'violet'],
    [4, 0, 1, 'violet'],
    [0, 2, 2, 'cyan'],
    [2, 1, 1, 'pink'],
    [3, 2, 2, 'amber'],
    [4, 2, 1, 'cyan'],
    [1, 3, 1, 'pink'],
  ];
</script>

{#snippet tile(key: string, label: string, onclick: () => void, icon: string)}
  <!-- The description stays outside the button so its name matches its visible label;
       the button stretches over the whole tile. -->
  <div class="tile">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
    <div class="tile-text">
      <button type="button" aria-describedby="{uid}-{key}-d" {onclick}>{$t(label)}</button>
      <p class="tile-desc" id="{uid}-{key}-d">{$t(label + '.hint')}</p>
    </div>
  </div>
{/snippet}

<section class="welcome" aria-labelledby="{uid}-h">
  <div class="copy">
    <h3 id="{uid}-h">{$t('start.title')}</h3>
    <p class="intro">{$t('start.intro')}</p>
  </div>

  <div class="rest">
    <ul class="roles" aria-label={$t('start.roles')}>
      {#each ROLES as role (role.key)}
        {@const label = `start.role.${role.key}`}
        {@const does = $t(label + '.does')}
        {@const cut = does.lastIndexOf(' ') + 1}
        <li class="role {role.tone}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={role.icon} /></svg>
          <button
            type="button"
            aria-describedby="{uid}-{role.key}-aka {uid}-{role.key}-does"
            onclick={() => wizard?.show(role.mode, role.key === 'po')}>{$t(label)}</button
          >
          <!-- Organisations name these roles differently: the usual titles (#387). -->
          <p class="aka" id="{uid}-{role.key}-aka">{$t(label + '.aka')}</p>
          <!-- The arrow stays with the last word when the text wraps. -->
          <p class="does" id="{uid}-{role.key}-does">
            {does.slice(0, cut)}<span class="last"
              >{does.slice(cut)}<svg viewBox="0 0 24 24" aria-hidden="true"
                ><path d="M5 12h14M13 6l6 6-6 6" /></svg
              ></span
            >
          </p>
        </li>
      {/each}
    </ul>
    <p class="hint">{$t('start.plan.hint')}</p>

    <p class="or"><span>{$t('start.or')}</span></p>

    <div class="tiles">
      {@render tile('file', 'start.file', onOpenFile, folder)}
      {@render tile('example', 'start.example', onOpenExample, sparkle)}
      {@render tile('lineExample', 'start.lineExample', onOpenLineExample, org)}
    </div>

    <p class="foot">
      <button type="button" class="link" onclick={onManual}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"
          />
        </svg>
        {$t('start.manual')}
      </button>
      <span class="private">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4" />
        </svg>
        {$t('start.private')}
      </span>
    </p>
  </div>

  <div class="art" aria-hidden="true">
    <div class="week">
      <div class="week-head">
        {#each [0, 1, 2, 3, 4] as d (d)}<span></span>{/each}
      </div>
      <div class="week-grid">
        {#each chips as [col, row, span, hue], i (i)}
          <span
            class="chip {hue}"
            style:grid-column={col + 1}
            style:grid-row="{row + 1} / span {span}"
          ></span>
        {/each}
      </div>
      <svg class="pulse" viewBox="0 0 300 56">
        <defs>
          <linearGradient id="{uid}-pulse" x1="0" x2="1">
            <stop offset="0" stop-color="#8b7bff" /><stop offset="1" stop-color="#22c3ee" />
          </linearGradient>
        </defs>
        <path
          d="M0 32h52l10-18 14 36 12-28 8 10h46l10-18 14 36 12-28 8 10h114"
          stroke="url(#{uid}-pulse)"
          pathLength="1"
        />
      </svg>
    </div>
  </div>
</section>

<SetupWizard bind:this={wizard} oncreated={(_, mode) => onCreated(mode)} />

<style>
  .welcome {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
    margin-top: 0.75rem;
    padding: clamp(1.5rem, 4vw, 3.5rem);
    border-radius: calc(var(--radius-lg) * 1.5);
    background:
      radial-gradient(60% 70% at 100% 0%, rgb(139 123 255 / 0.16), transparent 70%),
      radial-gradient(50% 60% at 85% 100%, rgb(34 195 238 / 0.12), transparent 70%), var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  /* Title and art side by side; the roles and the other ways in span the whole width. */
  .welcome {
    grid-template-areas: 'copy art' 'rest rest';
    row-gap: 1.75rem;
  }
  .copy {
    grid-area: copy;
    max-width: 36rem;
  }
  .rest {
    grid-area: rest;
    min-width: 0;
  }
  .art {
    grid-area: art;
  }
  :global(#app) .welcome h3 {
    margin: 0 0 0.75rem;
    font-size: clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem);
    font-weight: 780;
    line-height: 1.1;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .intro {
    margin: 0 0 1.75rem;
    font-size: 1.05rem;
    line-height: 1.55;
    color: var(--text-muted);
    text-wrap: pretty;
  }
  /* ---------- Roles (#387): one card per role, in its level's colour ---------- */
  .roles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .role {
    --tone: var(--accent-text);
    --tone-soft: var(--accent-soft);
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.85rem;
    align-content: start;
    padding: 1rem 1.1rem 1.05rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    transition:
      border-color 0.15s,
      background-color 0.15s,
      box-shadow 0.15s;
  }
  .role.line {
    --tone: var(--line);
    --tone-soft: var(--line-soft);
  }
  .role.area {
    --tone: var(--area);
    --tone-soft: var(--area-soft);
  }
  .role.org {
    --tone: var(--org);
    --tone-soft: var(--org-soft);
  }
  .role:hover,
  .role:has(button:focus-visible) {
    border-color: var(--tone);
    background: color-mix(in srgb, var(--tone-soft) 60%, var(--surface));
    box-shadow: 0 10px 24px -18px var(--tone);
  }
  .role > svg {
    grid-row: span 3;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0.5rem;
    border-radius: 0.75rem;
    background: var(--tone-soft);
    fill: none;
    stroke: var(--tone);
    stroke-width: 1.8;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  :global(#app) .welcome .role button {
    position: static;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.3;
    text-align: start;
    transform: none;
  }
  /* The whole card is the click target. */
  .role button::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  @supports selector(:has(*)) {
    :global(#app) .welcome .role button:focus-visible {
      outline: none;
    }
    .role:has(button:focus-visible) {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
  }
  .does {
    margin: 0.45rem 0 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--tone);
  }
  .last {
    white-space: nowrap;
  }
  /* Inline, so the arrow follows the last word when the text wraps. */
  .does svg {
    display: inline-block;
    width: 0.95rem;
    height: 0.95rem;
    margin-inline-start: 0.3rem;
    vertical-align: -0.15em;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s;
  }
  .role:hover .does svg {
    transform: translateX(3px);
  }
  .aka {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--text-muted);
    text-wrap: pretty;
  }
  @media (prefers-reduced-motion: reduce) {
    .does svg {
      transition: none;
    }
  }
  .hint {
    margin: 0.75rem 0 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 2rem 0 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.75rem;
  }
  .tile {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }
  .tile:hover,
  .tile:has(button:focus-visible) {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  :global(#app) .welcome .tile button {
    position: static;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    font-size: 1rem;
    font-weight: 650;
    text-align: start;
    /* The shared pressed style moves buttons by 1px; a transform would make the button the
       containing block of ::after and shrink the click area mid-click. */
    transform: none;
  }
  /* The whole tile is the click target. */
  .tile button::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  /* The ring goes around the whole tile where :has() exists; elsewhere the button keeps its own. */
  @supports selector(:has(*)) {
    :global(#app) .welcome .tile button:focus-visible {
      outline: none;
    }
    .tile:has(button:focus-visible) {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
  }
  .tile > svg {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0.45rem;
    border-radius: 0.65rem;
    background: var(--accent-soft);
    fill: none;
    stroke: var(--accent-text);
    stroke-width: 1.8;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .tile-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .tile-desc {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 400;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.75rem;
    margin: 1.75rem 0 0;
  }
  .foot svg {
    width: 1.1rem;
    height: 1.1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  :global(#app) .welcome button.link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .private {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* ---------- Decorative week ---------- */
  .art {
    display: grid;
    place-items: center;
  }
  .week {
    position: relative;
    width: min(100%, 26rem);
    padding: 1.25rem;
    border-radius: 1.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow:
      0 30px 60px -30px rgb(83 64 230 / 0.45),
      0 12px 24px -16px rgb(15 20 38 / 0.25);
    transform: rotate(-2deg);
  }
  .week-head,
  .week-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
  }
  .week-head {
    margin-bottom: 0.75rem;
  }
  .week-head span {
    height: 0.5rem;
    border-radius: 99px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .week-grid {
    grid-template-rows: repeat(4, 2.25rem);
    background-image: linear-gradient(var(--border) 1px, transparent 1px);
    background-size: 100% calc(2.25rem + 0.5rem);
    background-position: 0 -1px;
  }
  .chip {
    border-radius: 0.5rem;
    border-inline-start: 3px solid;
  }
  .violet {
    background: rgb(139 123 255 / 0.22);
    border-color: #8b7bff;
  }
  .cyan {
    background: rgb(34 195 238 / 0.2);
    border-color: #22c3ee;
  }
  .pink {
    background: rgb(244 114 182 / 0.2);
    border-color: #f472b6;
  }
  .amber {
    background: rgb(251 191 36 / 0.22);
    border-color: #f5b324;
  }
  .pulse {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px dashed var(--border);
    overflow: visible;
  }
  .pulse path {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 4px 10px rgb(83 64 230 / 0.35));
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 1.6s 0.2s ease-out forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse path {
      stroke-dashoffset: 0;
    }
  }

  @media (max-width: 64rem) {
    .welcome {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'copy' 'rest';
    }
    .art {
      display: none;
    }
  }
</style>
