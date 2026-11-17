import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { emptyWorkspace, type Workspace } from '../../core/model';
import { validate, type Result } from '../../core/validate';
import { workspaceIndex, type Filter } from '../../core/views';
import { detectLocale } from '../../i18n';

export const MAX_HISTORY = 50;

export type Change = (
  ws: Workspace,
) => Workspace | Result<Workspace> | [Workspace, string] | Result<[Workspace, string]>;

function isResult<T>(x: unknown): x is Result<T> {
  return typeof x === 'object' && x !== null && typeof (x as { ok?: unknown }).ok === 'boolean';
}

export function createWorkspaceStore(initial: Workspace) {
  const state = writable<Workspace>(initial);
  const dirty = writable(false);
  const fileName = writable<string | null>(null);
  const history = writable<Workspace[]>([]);
  const version = writable(0);
  /** Set while presenting: the state, undo history and dirty flag to return to (M1). */
  const baseline = writable<{ ws: Workspace; history: Workspace[]; dirty: boolean } | null>(null);

  function apply(change: Change): Result<Workspace> & { id?: string } {
    const current = get(state);
    // The change works on a copy, so in-place mutation can neither corrupt the live state nor history.
    const raw = change(structuredClone(current));
    let unwrapped: Workspace | [Workspace, string];
    if (isResult<Workspace | [Workspace, string]>(raw)) {
      if (!raw.ok) return raw;
      unwrapped = raw.value;
    } else {
      unwrapped = raw;
    }
    const next = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped;
    const id = Array.isArray(unwrapped) ? unwrapped[1] : undefined;
    const checked = validate(next);
    if (!checked.ok) return checked;
    if (JSON.stringify(checked.value) === JSON.stringify(current))
      return id === undefined ? { ok: true, value: current } : { ok: true, value: current, id };
    history.update((h) => [...h, structuredClone(current)].slice(-MAX_HISTORY));
    state.set(checked.value);
    // A what-if while presenting is not a change to the file.
    if (!get(baseline)) dirty.set(true);
    return id === undefined ? checked : { ...checked, id };
  }

  function undo(): boolean {
    const h = get(history);
    const previous = h[h.length - 1];
    if (previous === undefined) return false;
    history.set(h.slice(0, -1));
    state.set(previous);
    if (!get(baseline)) dirty.set(true);
    return true;
  }

  function replace(ws: Workspace, opts: { fileName: string | null; dirty: boolean }): void {
    // Another workspace ends presenting; its what-ifs belonged to the old one.
    baseline.set(null);
    history.set([]);
    version.update((n) => n + 1);
    state.set(ws);
    fileName.set(opts.fileName);
    dirty.set(opts.dirty);
  }

  /**
   * Starts presenting: from now on changes are what-ifs. Undo covers only them, and
   * `endPresent` brings back the state, history and dirty flag from before.
   */
  function beginPresent(): void {
    if (get(baseline)) return;
    baseline.set({ ws: get(state), history: get(history), dirty: get(dirty) });
    history.set([]);
  }

  /** Ends presenting and discards every what-if; the file stays as it was. */
  function endPresent(): void {
    const b = get(baseline);
    if (!b) return;
    baseline.set(null);
    history.set(b.history);
    state.set(b.ws);
    dirty.set(b.dirty);
  }

  /** Undoes every what-if and keeps presenting. */
  function resetPresent(): void {
    const b = get(baseline);
    if (!b) return;
    history.set([]);
    state.set(b.ws);
  }

  /**
   * Changes how the state looks while presenting (names hidden) without an undo step; the
   * history gets the same change so an undo does not bring the names back.
   */
  function presentView(change: (ws: Workspace) => Workspace): void {
    if (!get(baseline)) return;
    state.update(change);
    history.update((h) => h.map(change));
  }

  function markSaved(name: string): void {
    fileName.set(name);
    dirty.set(false);
  }

  /** Records a new file name but leaves the dirty flag alone. */
  function setFileName(name: string): void {
    fileName.set(name);
  }

  return {
    subscribe: state.subscribe,
    setFileName,
    apply,
    undo,
    canUndo: derived(history, (h) => h.length > 0) as Readable<boolean>,
    dirty: { subscribe: dirty.subscribe } as Readable<boolean>,
    fileName: { subscribe: fileName.subscribe } as Readable<string | null>,
    /** Increments whenever the whole workspace is replaced (New, Open, example, restore). */
    version: { subscribe: version.subscribe } as Readable<number>,
    replace,
    markSaved,
    beginPresent,
    endPresent,
    resetPresent,
    presentView,
    /** The state from before presenting, or null when not presenting. */
    presentBase: derived(baseline, (b) => b?.ws ?? null) as Readable<Workspace | null>,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

/**
 * The selected team or area (ids share one space). Falls back to the first team (or null) when
 * the workspace no longer has it.
 */
export function createActiveTeamId(ws: Readable<Workspace>): Writable<string | null> {
  const active = writable<string | null>(null);
  ws.subscribe(($ws) => {
    const current = get(active);
    if (current !== null && [...$ws.teams, ...$ws.areas].some((u) => u.id === current)) return;
    const fallback = $ws.teams[0]?.id ?? null;
    if (fallback !== current) active.set(fallback);
  });
  return active;
}

export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const initialWorkspace: Workspace = (() => {
  const ws = emptyWorkspace(localToday());
  ws.settings.locale = detectLocale();
  return ws;
})();

export const workspace = createWorkspaceStore(initialWorkspace);
export const index = derived(workspace, workspaceIndex);
export const activeTeamId = createActiveTeamId(workspace);
export const filter = writable<Filter>({});
