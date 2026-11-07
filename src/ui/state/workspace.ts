import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { emptyWorkspace, type Workspace } from '../../core/model';
import { validate, type Result } from '../../core/validate';
import { workspaceIndex, type Filter } from '../../core/views';
import { detectLocale } from '../../i18n';

export const MAX_HISTORY = 50;

export type Change = (ws: Workspace) => Workspace | Result<Workspace> | [Workspace, string];

function isResult(x: Workspace | Result<Workspace>): x is Result<Workspace> {
  return 'ok' in x && typeof (x as { ok: unknown }).ok === 'boolean';
}

export function createWorkspaceStore(initial: Workspace) {
  const state = writable<Workspace>(initial);
  const dirty = writable(false);
  const fileName = writable<string | null>(null);
  const history = writable<Workspace[]>([]);

  function apply(change: Change): Result<Workspace> & { id?: string } {
    const current = get(state);
    // The change works on a copy, so in-place mutation can neither corrupt the live state nor history.
    const raw = change(structuredClone(current));
    const out = Array.isArray(raw) ? raw[0] : raw;
    const id = Array.isArray(raw) ? raw[1] : undefined;
    let next: Workspace;
    if (isResult(out)) {
      if (!out.ok) return out;
      next = out.value;
    } else {
      next = out;
    }
    const checked = validate(next);
    if (!checked.ok) return checked;
    if (JSON.stringify(checked.value) === JSON.stringify(current))
      return id === undefined ? { ok: true, value: current } : { ok: true, value: current, id };
    history.update((h) => [...h, structuredClone(current)].slice(-MAX_HISTORY));
    state.set(checked.value);
    dirty.set(true);
    return id === undefined ? checked : { ...checked, id };
  }

  function undo(): boolean {
    const h = get(history);
    const previous = h[h.length - 1];
    if (previous === undefined) return false;
    history.set(h.slice(0, -1));
    state.set(previous);
    dirty.set(true);
    return true;
  }

  function replace(ws: Workspace, opts: { fileName: string | null; dirty: boolean }): void {
    history.set([]);
    state.set(ws);
    fileName.set(opts.fileName);
    dirty.set(opts.dirty);
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
    replace,
    markSaved,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

/** A writable team id that falls back to the first team (or null) whenever the workspace changes. */
export function createActiveTeamId(ws: Readable<Workspace>): Writable<string | null> {
  const active = writable<string | null>(null);
  ws.subscribe(($ws) => {
    const current = get(active);
    if (current !== null && $ws.teams.some((t) => t.id === current)) return;
    const fallback = $ws.teams[0]?.id ?? null;
    if (fallback !== current) active.set(fallback);
  });
  return active;
}

function localToday(): string {
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
