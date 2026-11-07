import type { Workspace } from '../../core/model';
import { loadWorkspace, type Result } from '../../core/validate';

export const DEFAULT_FILE_NAME = 'workspace.caldence.json';

export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

interface PickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[];
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
}

export interface FileEnv {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike>;
  download(name: string, text: string): void;
  pickFile(): Promise<File | null>;
}

export function serialize(ws: Workspace): string {
  return JSON.stringify(ws, null, 2) + '\n';
}

const jsonTypes = [{ accept: { 'application/json': ['.json'] } }];

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function createFileService(env: FileEnv) {
  let handle: FileHandleLike | null = null;

  async function open(): Promise<Result<{ ws: Workspace; name: string }> | null> {
    let text: string;
    let name: string;
    let picked: FileHandleLike | null = null;
    if (env.showOpenFilePicker) {
      try {
        const [first] = await env.showOpenFilePicker({ types: jsonTypes });
        if (!first) return null;
        picked = first;
        const file = await first.getFile();
        text = await file.text();
        name = first.name;
      } catch (error) {
        if (isAbort(error)) return null;
        throw error;
      }
    } else {
      const file = await env.pickFile();
      if (!file) return null;
      text = await file.text();
      name = file.name;
    }
    const loaded = loadWorkspace(text);
    if (!loaded.ok) return loaded;
    handle = picked; // replaces any earlier handle (null in the fallback path)
    return { ok: true, value: { ws: loaded.value, name } };
  }

  async function write(target: FileHandleLike, ws: Workspace): Promise<string> {
    const writable = await target.createWritable();
    await writable.write(serialize(ws));
    await writable.close();
    return target.name;
  }

  async function saveAs(ws: Workspace, name: string | null): Promise<string | null> {
    const suggested = name ?? DEFAULT_FILE_NAME;
    if (env.showSaveFilePicker) {
      try {
        const target = await env.showSaveFilePicker({ suggestedName: suggested, types: jsonTypes });
        const saved = await write(target, ws);
        handle = target;
        return saved;
      } catch (error) {
        if (isAbort(error)) return null;
        throw error;
      }
    }
    env.download(suggested, serialize(ws));
    return suggested;
  }

  async function save(ws: Workspace, name: string | null): Promise<string | null> {
    if (handle) return write(handle, ws);
    return saveAs(ws, name);
  }

  /** Drops the remembered handle, e.g. when the workspace was replaced by another one. */
  function forget(): void {
    handle = null;
  }

  return { open, save, saveAs, forget };
}

/** Real browser environment: picker APIs where present, otherwise a download link and a file input. */
export function browserFileEnv(pickFile: () => Promise<File | null>): FileEnv {
  const w = window as unknown as Pick<FileEnv, 'showOpenFilePicker' | 'showSaveFilePicker'>;
  return {
    showOpenFilePicker: w.showOpenFilePicker?.bind(window),
    showSaveFilePicker: w.showSaveFilePicker?.bind(window),
    pickFile,
    download(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  };
}
