// The sidebar folded into a narrow rail of icons, remembered per browser (like the theme).
import { writable } from 'svelte/store';

const KEY = 'caldence.sidebar';

/** True when the saved choice is the rail; false when nothing is saved or storage is blocked. */
export function loadRail(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(KEY) === 'rail';
  } catch {
    return false;
  }
}

export const rail = writable<boolean>(loadRail());

/** Folds or unfolds the sidebar and remembers it. Storage errors only mean it is not remembered. */
export function setRail(value: boolean, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  rail.set(value);
  try {
    const target = storage ?? globalThis.localStorage;
    if (value) target?.setItem(KEY, 'rail');
    else target?.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page is closed.
  }
}
