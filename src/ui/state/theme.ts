// Light or dark display, picked per browser. 'system' follows the operating system and is the default.
import { writable } from 'svelte/store';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'caldence.theme';

// Reading localStorage itself throws when site data is blocked, so it is only touched inside a try.
function local(): Storage | undefined {
  return globalThis.localStorage;
}

/** The saved choice, or 'system' when nothing valid is saved or storage is blocked. */
export function loadTheme(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    const value = (storage ?? local())?.getItem(KEY);
    return (THEMES as readonly string[]).includes(value ?? '') ? (value as Theme) : 'system';
  } catch {
    return 'system';
  }
}

/** Sets data-theme on <html> (none for 'system'); tokens.css switches color-scheme on it.
 * public/theme-init.js does the same before the first paint. */
export function applyTheme(value: Theme, root: HTMLElement = document.documentElement): void {
  if (value === 'system') delete root.dataset.theme;
  else root.dataset.theme = value;
}

export const theme = writable<Theme>(loadTheme());

/** Applies and remembers the choice. Storage errors only mean it is not remembered. */
export function setTheme(
  value: Theme,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
  root?: HTMLElement,
): void {
  theme.set(value);
  applyTheme(value, root);
  try {
    const target = storage ?? local();
    if (value === 'system') target?.removeItem(KEY);
    else target?.setItem(KEY, value);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page is closed.
  }
}
