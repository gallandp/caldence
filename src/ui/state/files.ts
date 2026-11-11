import type { Workspace } from '../../core/model';
import { loadWorkspace, type Result } from '../../core/validate';

export const DEFAULT_FILE_NAME = 'workspace.caldence.json';

export interface WritableLike {
  write(data: string | Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

export interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface PickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[];
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
}

export interface FileEnv {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike>;
  download(name: string, data: string | Uint8Array<ArrayBuffer>): void;
  /** `accept` is the value for the file input's accept attribute. */
  pickFile(accept?: string): Promise<File | null>;
}

export function serialize(ws: Workspace): string {
  return JSON.stringify(ws, null, 2) + '\n';
}

const jsonTypes = [{ accept: { 'application/json': ['.json'] } }];

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The picker was refused because the user activation was used up or has expired. */
export function isActivationError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'SecurityError' || error.name === 'NotAllowedError')
  );
}

/** How long after a cancel event, or the window regaining focus, a file input may still report its file. */
export const PICK_FOCUS_DELAY_MS = 1000;

/**
 * Opens the file dialog of `input` and resolves with the chosen file, or null when the dialog was
 * dismissed. Browsers that never fire `cancel` are covered by the window regaining focus after the
 * dialog took it away: if no file shows up shortly after, the dialog is taken as dismissed. A focus
 * event without an earlier blur says nothing about the dialog and is ignored.
 */
export function pickWithInput(
  input: HTMLInputElement,
  win: EventTarget,
  delay = PICK_FOCUS_DELAY_MS,
): Promise<File | null> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let blurred = false;
    const finish = (file: File | null) => {
      clearTimeout(timer);
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('blur', onBlur);
      resolve(file);
    };
    const onChange = () => finish(input.files?.[0] ?? null);
    // Firefox can report `cancel` before the chosen file arrives, so a cancel is only final when
    // no file follows shortly after.
    const onCancel = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(input.files?.[0] ?? null), delay);
    };
    const onBlur = () => {
      blurred = true;
    };
    const onFocus = () => {
      if (!blurred) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish(input.files?.[0] ?? null), delay);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    win.addEventListener('focus', onFocus);
    win.addEventListener('blur', onBlur);
    input.value = '';
    input.click();
  });
}

/** The accept attribute for a file input that takes the given picker types. */
function acceptString(types: FilePickerType[]): string {
  return types
    .flatMap((type) => Object.entries(type.accept).flatMap(([mime, exts]) => [...exts, mime]))
    .join(',');
}

/**
 * Reads a text file chosen by the user; null when cancelled. Never touches the workspace handle.
 * With `decode`, the raw bytes go through it instead of the browser's UTF-8 decoding (for example
 * `unfoldBytes` for .ics files, which must be unfolded before they are decoded).
 */
export async function openTextFile(
  env: FileEnv,
  types: FilePickerType[],
  decode?: (bytes: Uint8Array) => string,
): Promise<{ name: string; text: string } | null> {
  const read = async (file: File): Promise<string> =>
    decode ? decode(new Uint8Array(await file.arrayBuffer())) : file.text();
  try {
    if (env.showOpenFilePicker) {
      const [first] = await env.showOpenFilePicker({ types });
      if (!first) return null;
      const file = await first.getFile();
      return { name: first.name, text: await read(file) };
    }
    const file = await env.pickFile(acceptString(types));
    return file ? { name: file.name, text: await read(file) } : null;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Saves text through the save picker or a download; returns the file name, or null when cancelled. */
export async function exportTextFile(
  env: FileEnv,
  name: string,
  text: string | Uint8Array<ArrayBuffer>,
  types: FilePickerType[],
): Promise<string | null> {
  if (env.showSaveFilePicker) {
    try {
      const target = await env.showSaveFilePicker({ suggestedName: name, types });
      const writable = await target.createWritable();
      await writable.write(text);
      await writable.close();
      return target.name;
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  env.download(name, text);
  return name;
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
export function browserFileEnv(pickFile: (accept?: string) => Promise<File | null>): FileEnv {
  const w = window as unknown as Pick<FileEnv, 'showOpenFilePicker' | 'showSaveFilePicker'>;
  return {
    showOpenFilePicker: w.showOpenFilePicker?.bind(window),
    showSaveFilePicker: w.showSaveFilePicker?.bind(window),
    pickFile,
    download(name, data) {
      const type = name.endsWith('.ics')
        ? 'text/calendar'
        : name.endsWith('.zip')
          ? 'application/zip'
          : 'application/json';
      const url = URL.createObjectURL(new Blob([data], { type }));
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
