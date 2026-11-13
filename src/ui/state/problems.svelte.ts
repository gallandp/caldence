import { onMount } from 'svelte';
import { activeTeamId, workspace, type Change } from './workspace';

export type Problem = { key: string; path: string; params?: Record<string, string | number> };

/** True while a change made inside the open view is applied. Only one view is open at a time, so
    every part of it (the view and its cards) treats such a change as its own. */
let ownDepth = 0;

/** Applies a change that comes from the open view itself. */
export function applyOwn(change: Change) {
  ownDepth++;
  try {
    return workspace.apply(change);
  } finally {
    ownDepth--;
  }
}

/** Whether the workspace change being announced right now comes from the open view. */
export const isOwnChange = () => ownDepth > 0;

/**
 * Inline errors of a card's refused commits, and an epoch that drafts can key on. A foreign
 * change (undo, open, new) or another team makes both stale. Create it during component init.
 */
export class Problems {
  errors = $state<Record<string, Problem>>({});
  /** Bumped when drafts must be dropped (a foreign workspace change or another team). */
  epoch = $state(0);
  readonly #uid: string;

  constructor(uid: string) {
    this.#uid = uid;
    onMount(() => {
      // A store calls back once right away; only later calls are changes.
      let ready = false;
      const reset = () => {
        if (!ready) return;
        this.errors = {};
        this.epoch++;
      };
      const stop = [
        workspace.subscribe(() => {
          if (!isOwnChange()) reset();
        }),
        activeTeamId.subscribe(reset),
      ];
      ready = true;
      return () => stop.forEach((fn) => fn());
    });
  }

  /** Commits a change; on refusal shows the first error under `id` (with `label` as its path). */
  commit = (id: string, label: string, change: Change): boolean => {
    const result = applyOwn(change);
    const rest = { ...this.errors };
    delete rest[id];
    if (result.ok) {
      this.errors = rest;
      return true;
    }
    this.errors = { ...rest, [id]: { key: result.errors[0]?.key ?? 'error.type', path: label } };
    return false;
  };

  fail = (id: string, key: string, label: string, params?: Problem['params']): void => {
    this.errors = { ...this.errors, [id]: { key, path: label, params } };
  };

  clear = (id: string): void => {
    const rest = { ...this.errors };
    delete rest[id];
    this.errors = rest;
  };

  /** DOM id of the error message of `id`. */
  dom = (id: string): string => `${this.#uid}-${id.replace(/[^\w-]/g, '_')}-err`;
  /** `aria-describedby` for a field whose error is `id`, if it has one. */
  describe = (id: string): string | undefined => (this.errors[id] ? this.dom(id) : undefined);
  invalid = (id: string): 'true' | undefined => (this.errors[id] ? 'true' : undefined);
}
