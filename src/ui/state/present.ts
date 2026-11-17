import { derived, get, writable } from 'svelte/store';
import { translate } from '../../i18n';
import { withNames, withoutNames } from '../../core/whatIf';
import { workspace } from './workspace';

/**
 * Present mode (persona concept M1): the coach shows Caldence in a meeting. Edit noise recedes,
 * changes are what-ifs that end with the presentation, and names can be hidden (Q8). Nothing of
 * this is saved, neither in the file nor in the browser.
 */
export const presenting = derived(workspace.presentBase, (b) => b !== null);
export const hideNames = writable(false);
// Presenting can also end by another workspace replacing this one: names start visible next time.
workspace.presentBase.subscribe((b) => {
  if (b === null) hideNames.set(false);
});

export function startPresenting(): void {
  workspace.beginPresent();
}

export function stopPresenting(): void {
  hideNames.set(false);
  workspace.endPresent();
}

/** Back to the state from when presenting started; names stay hidden if they were. */
export function resetWhatIf(): void {
  workspace.resetPresent();
  if (get(hideNames)) setHideNames(true);
}

export function setHideNames(on: boolean): void {
  hideNames.set(on);
  const base = get(workspace.presentBase);
  if (!base) return;
  const t = get(translate);
  workspace.presentView((ws) =>
    on ? withoutNames(ws, (n) => t('present.person', { n })) : withNames(ws, base),
  );
}
