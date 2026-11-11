<script lang="ts">
  import { translate as t } from '../../i18n';
  import SetupWizard from '../setup/SetupWizard.svelte';

  let {
    onOpenFile,
    onOpenExample,
    onManual,
    onCreated,
  }: {
    onOpenFile: () => void;
    onOpenExample: () => void;
    /** Switches to Help. */
    onManual: () => void;
    /** A team was created by the wizard. */
    onCreated: () => void;
  } = $props();

  const uid = $props.id();
  let wizard: SetupWizard | undefined;

  const folder =
    'M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z';
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

    <div class="plan">
      <button type="button" class="primary big" onclick={() => wizard?.show()}>
        {$t('setup.open')}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
      <p class="hint">{$t('start.plan.hint')}</p>
    </div>

    <p class="or"><span>{$t('start.or')}</span></p>

    <div class="tiles">
      {@render tile('file', 'start.file', onOpenFile, folder)}
      {@render tile('example', 'start.example', onOpenExample, sparkle)}
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
          d="M0 32h52l10-18 14 36 12-28 8 12h46l10-18 14 36 12-28 8 12h114"
          stroke="url(#{uid}-pulse)"
          pathLength="1"
        />
      </svg>
    </div>
  </div>
</section>

<SetupWizard bind:this={wizard} oncreated={onCreated} />

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
  .copy {
    max-width: 32rem;
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
  .plan {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  :global(#app) .welcome button.big {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem 1.4rem;
    font-size: 1.05rem;
    border-radius: calc(var(--radius) * 1.4);
  }
  .big svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s;
  }
  .big:hover svg {
    transform: translateX(3px);
  }
  .hint {
    margin: 0;
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
  }
  /* The whole tile is the click target. */
  .tile button::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  :global(#app) .welcome .tile button:focus-visible {
    outline: none;
  }
  .tile:has(button:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
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
      min-height: 0;
    }
    .art {
      display: none;
    }
  }
</style>
