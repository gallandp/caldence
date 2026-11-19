// The UI language, picked per browser like the theme (#337). The file's `settings.locale` is only
// the default while this browser has none, so switching the language never changes the file.
import { writable } from 'svelte/store';
import type { Locale } from '../../i18n';

const KEY = 'caldence.locale';

// Reading localStorage itself throws when site data is blocked, so it is only touched inside a try.
function local(): Storage | undefined {
  return globalThis.localStorage;
}

/** The saved choice, or undefined when nothing valid is saved or storage is blocked. */
export function loadLanguage(storage?: Pick<Storage, 'getItem'>): Locale | undefined {
  try {
    const value = (storage ?? local())?.getItem(KEY);
    return value === 'de' || value === 'en' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** This browser's language, or undefined to follow the file. */
export const language = writable<Locale | undefined>(loadLanguage());

/** Uses and remembers the choice. Storage errors only mean it is not remembered. */
export function setLanguage(value: Locale, storage?: Pick<Storage, 'setItem'>): void {
  language.set(value);
  try {
    (storage ?? local())?.setItem(KEY, value);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page is closed.
  }
}
