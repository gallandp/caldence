<script lang="ts">
  import { translate as t } from '../i18n';
  import { THEMES, theme, setTheme, type Theme } from './state/theme';

  const icons: Record<Theme, string> = {
    system: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 20h8M12 16v4',
    light:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    dark: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  };
  /** The id of a note that describes the switch. */
  let { describedby }: { describedby?: string } = $props();
  const buttons: HTMLButtonElement[] = [];

  // Radio group keyboard pattern: arrows move and select, only the checked option is tabbable.
  function onKeydown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = (index + step + THEMES.length) % THEMES.length;
    setTheme(THEMES[next]!);
    buttons[next]?.focus();
  }
</script>

<div class="theme">
  <span id="theme-label">{$t('theme.label')}</span>
  <div
    class="options"
    role="radiogroup"
    aria-labelledby="theme-label"
    aria-describedby={describedby}
  >
    {#each THEMES as option, i (option)}
      <button
        type="button"
        role="radio"
        aria-checked={$theme === option}
        tabindex={$theme === option ? 0 : -1}
        bind:this={buttons[i]}
        onclick={() => setTheme(option)}
        onkeydown={(e) => onKeydown(e, i)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[option]} /></svg>
        <span>{$t('theme.' + option)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  /* A segmented control in Settings. #app beats the shared button styles in theme.css. */
  .theme {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  /* Same look as the field labels next to it. */
  #theme-label {
    font-size: 0.85rem;
    font-weight: 550;
  }
  .options {
    display: inline-flex;
    flex-wrap: wrap;
    max-width: 100%;
    padding: 2px;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
  }
  :global(#app) .options button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0 0.6rem;
    white-space: nowrap;
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    color: var(--text);
    background: transparent;
    cursor: pointer;
    box-shadow: none;
    font: inherit;
  }
  :global(#app) .options button:not([aria-checked='true']):hover {
    background: var(--accent-soft);
  }
  :global(#app) .options button[aria-checked='true'] {
    color: var(--on-accent);
    background: var(--accent);
  }
  :global(#app) .options button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  svg {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (forced-colors: active) {
    :global(#app) .options button {
      color: ButtonText;
    }
    :global(#app) .options button[aria-checked='true'] {
      color: HighlightText;
      background: Highlight;
    }
  }
</style>
