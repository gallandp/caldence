<script lang="ts">
  import { translate as t } from '../i18n';
  import { THEMES, theme, setTheme, type Theme } from './state/theme';

  const icons: Record<Theme, string> = {
    system: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 20h8M12 16v4',
    light:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    dark: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  };
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
  <span id="theme-label" class="sr-only">{$t('theme.label')}</span>
  <div class="options" role="radiogroup" aria-labelledby="theme-label">
    {#each THEMES as option, i (option)}
      <button
        type="button"
        role="radio"
        aria-checked={$theme === option}
        aria-label={$t('theme.' + option)}
        title={$t('theme.' + option)}
        tabindex={$theme === option ? 0 : -1}
        bind:this={buttons[i]}
        onclick={() => setTheme(option)}
        onkeydown={(e) => onKeydown(e, i)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[option]} /></svg>
      </button>
    {/each}
  </div>
</div>

<style>
  /* #app beats the shared button styles in theme.css. */
  .theme {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    color: var(--side-text);
    font-size: 0.85rem;
  }
  .options {
    display: inline-flex;
    padding: 2px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    border: 1px solid rgb(255 255 255 / 0.35);
  }
  :global(#app) .options button {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: var(--side-text);
    background: transparent;
    cursor: pointer;
    box-shadow: none;
    font-size: inherit;
  }
  :global(#app) .options button:hover {
    color: #fff;
  }
  :global(#app) .options button[aria-checked='true'] {
    color: #120e33;
    background: #c2b9ff;
  }
  :global(#app) .options button:focus-visible {
    outline: 2px solid #c2b9ff;
    outline-offset: 2px;
  }
  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (forced-colors: active) {
    .theme,
    :global(#app) .options button {
      color: CanvasText;
    }
    :global(#app) .options button[aria-checked='true'] {
      color: HighlightText;
      background: Highlight;
    }
  }
</style>
