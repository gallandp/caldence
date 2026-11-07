import { describe, expect, it, vi } from 'vitest';
import { addTeam } from '../../src/core/edit';
import { emptyWorkspace } from '../../src/core/model';
import { conflicts } from '../../src/core/views';
import { validate, loadWorkspace } from '../../src/core/validate';
import { workspaceIndex } from '../../src/core/views';
import { exampleWorkspace } from '../../src/data/examples';
import {
  DEFAULT_FILE_NAME,
  createFileService,
  exportTextFile,
  isActivationError,
  openTextFile,
  pickWithInput,
  serialize,
  type FileEnv,
  type FileHandleLike,
} from '../../src/ui/state/files';

const [ws] = addTeam(emptyWorkspace('2027-01-04'), 'A', '2027-01-04');

function fakeHandle(name: string, text = serialize(ws)) {
  const writes: string[] = [];
  const handle: FileHandleLike = {
    name,
    getFile: async () => new File([text], name),
    createWritable: async () => ({
      write: async (d: string) => void writes.push(d),
      close: async () => {},
    }),
  };
  return { handle, writes };
}

describe('serialize', () => {
  it('uses 2-space indent and a trailing newline, and round-trips', () => {
    const text = serialize(ws);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 2');
    const back = loadWorkspace(text);
    expect(back.ok && back.value).toEqual(ws);
  });
});

describe('file service with pickers', () => {
  it('saves to the opened handle without showing a picker', async () => {
    const { handle, writes } = fakeHandle('a.json');
    const showSaveFilePicker = vi.fn();
    const env: FileEnv = {
      showOpenFilePicker: async () => [handle],
      showSaveFilePicker,
      download: vi.fn(),
      pickFile: async () => null,
    };
    const svc = createFileService(env);
    const opened = await svc.open();
    expect(opened?.ok && opened.value.name).toBe('a.json');
    expect(await svc.save(ws, 'a.json')).toBe('a.json');
    expect(writes).toEqual([serialize(ws)]);
    expect(showSaveFilePicker).not.toHaveBeenCalled();
  });

  it('save without a handle asks for a location and keeps the handle', async () => {
    const { handle, writes } = fakeHandle('b.json');
    const showSaveFilePicker = vi.fn(async () => handle);
    const svc = createFileService({
      showSaveFilePicker,
      download: vi.fn(),
      pickFile: async () => null,
    });
    await svc.save(ws, null);
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: DEFAULT_FILE_NAME }),
    );
    await svc.save(ws, 'b.json');
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(2);
  });

  it('returns null when the user cancels', async () => {
    const abort = () => Promise.reject(new DOMException('x', 'AbortError'));
    const svc = createFileService({
      showOpenFilePicker: abort,
      showSaveFilePicker: abort,
      download: vi.fn(),
      pickFile: async () => null,
    });
    expect(await svc.open()).toBeNull();
    expect(await svc.saveAs(ws, null)).toBeNull();
  });

  it('reports a newer schema without keeping the handle', async () => {
    const bad = fakeHandle('new.json', JSON.stringify({ ...ws, schemaVersion: 99 }));
    const svc = createFileService({
      showOpenFilePicker: async () => [bad.handle],
      showSaveFilePicker: async () => fakeHandle('c.json').handle,
      download: vi.fn(),
      pickFile: async () => null,
    });
    const r = await svc.open();
    expect(r && !r.ok && r.errors[0]?.key).toBe('error.schema.newer');
    await svc.save(ws, null);
    expect(bad.writes).toEqual([]);
  });
});

describe('forget', () => {
  it('makes the next save ask for a location again', async () => {
    const first = fakeHandle('a.json');
    const second = fakeHandle('b.json');
    const showSaveFilePicker = vi.fn(async () => second.handle);
    const svc = createFileService({
      showOpenFilePicker: async () => [first.handle],
      showSaveFilePicker,
      download: vi.fn(),
      pickFile: async () => null,
    });
    await svc.open();
    svc.forget();
    await svc.save(ws, null);
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(first.writes).toEqual([]);
    expect(second.writes).toHaveLength(1);
  });
});

describe('file service without pickers', () => {
  it('saveAs downloads with the given name, default otherwise', async () => {
    const download = vi.fn();
    const svc = createFileService({ download, pickFile: async () => null });
    expect(await svc.saveAs(ws, 'x.json')).toBe('x.json');
    expect(download).toHaveBeenCalledWith('x.json', serialize(ws));
    await svc.save(ws, null);
    expect(download).toHaveBeenLastCalledWith(DEFAULT_FILE_NAME, serialize(ws));
  });

  it('open reads the picked file and reports invalid JSON', async () => {
    let file: File | null = new File([serialize(ws)], 'p.json');
    const svc = createFileService({ download: vi.fn(), pickFile: async () => file });
    const ok = await svc.open();
    expect(ok?.ok && ok.value.name).toBe('p.json');
    file = new File(['{nope'], 'bad.json');
    const bad = await svc.open();
    expect(bad && !bad.ok && bad.errors[0]?.key).toBe('error.file.json');
    file = null;
    expect(await svc.open()).toBeNull();
  });
});

describe('example workspace', () => {
  it('validates and has two teams sharing Alex, with all six rule types', () => {
    const example = exampleWorkspace();
    expect(validate(example).ok).toBe(true);
    expect(example.teams.map((t) => t.name)).toEqual(['Team Alpha', 'Team Beta']);
    const types = new Set(example.teams.flatMap((t) => t.events.map((e) => e.rule.type)));
    expect(types.size).toBe(6);
    const alex = example.people.find((p) => p.name === 'Alex')!;
    expect(example.teams.every((t) => t.members.some((m) => m.personId === alex.id))).toBe(true);
  });

  it('has overlapping events for Alex', () => {
    const example = exampleWorkspace();
    const alex = example.people.find((p) => p.name === 'Alex')!;
    expect(conflicts(example, workspaceIndex(example), alex.id).length).toBeGreaterThan(0);
  });
});

function fakeInput() {
  const target = new EventTarget();
  const input = Object.assign(target, {
    files: [] as unknown as FileList,
    value: 'x',
    click: vi.fn(),
  });
  return input as unknown as HTMLInputElement & { click: ReturnType<typeof vi.fn> };
}

describe('pickWithInput', () => {
  it('resolves with the chosen file on change', async () => {
    const input = fakeInput();
    const win = new EventTarget();
    const promise = pickWithInput(input, win);
    expect(input.click).toHaveBeenCalled();
    const file = new File(['{}'], 'a.json');
    input.files = [file] as unknown as FileList;
    input.dispatchEvent(new Event('change'));
    expect(await promise).toBe(file);
  });

  it('resolves null shortly after cancel', async () => {
    vi.useFakeTimers();
    try {
      const input = fakeInput();
      const promise = pickWithInput(input, new EventTarget(), 500);
      input.dispatchEvent(new Event('cancel'));
      await vi.advanceTimersByTimeAsync(500);
      expect(await promise).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still returns a file whose change event follows a cancel event', async () => {
    vi.useFakeTimers();
    try {
      const input = fakeInput();
      const promise = pickWithInput(input, new EventTarget(), 500);
      input.dispatchEvent(new Event('cancel'));
      await vi.advanceTimersByTimeAsync(100);
      const file = new File(['{}'], 'a.json');
      input.files = [file] as unknown as FileList;
      input.dispatchEvent(new Event('change'));
      expect(await promise).toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves null shortly after the window regains focus when no event fires', async () => {
    vi.useFakeTimers();
    try {
      const input = fakeInput();
      const win = new EventTarget();
      const promise = pickWithInput(input, win, 500);
      win.dispatchEvent(new Event('blur'));
      win.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(500);
      expect(await promise).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still returns a file that arrives right after the focus event', async () => {
    vi.useFakeTimers();
    try {
      const input = fakeInput();
      const win = new EventTarget();
      const promise = pickWithInput(input, win, 500);
      win.dispatchEvent(new Event('blur'));
      win.dispatchEvent(new Event('focus'));
      const file = new File(['{}'], 'a.json');
      input.files = [file] as unknown as FileList;
      await vi.advanceTimersByTimeAsync(500);
      expect(await promise).toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a focus event when the window never lost focus to a dialog', async () => {
    vi.useFakeTimers();
    try {
      const input = fakeInput();
      const win = new EventTarget();
      const promise = pickWithInput(input, win, 500);
      win.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(2000);
      const file = new File(['{}'], 'a.json');
      input.files = [file] as unknown as FileList;
      input.dispatchEvent(new Event('change'));
      expect(await promise).toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isActivationError', () => {
  it('matches SecurityError and NotAllowedError only', () => {
    expect(isActivationError(new DOMException('x', 'SecurityError'))).toBe(true);
    expect(isActivationError(new DOMException('x', 'NotAllowedError'))).toBe(true);
    expect(isActivationError(new DOMException('x', 'AbortError'))).toBe(false);
    expect(isActivationError(new Error('x'))).toBe(false);
  });
});

describe('text files', () => {
  const types = [{ description: 'Calendar', accept: { 'text/calendar': ['.ics'] } }];

  it('exportTextFile writes through the save picker and returns the chosen name', async () => {
    const { handle, writes } = fakeHandle('cal.ics');
    const showSaveFilePicker = vi.fn(async () => handle);
    const env: FileEnv = { showSaveFilePicker, download: vi.fn(), pickFile: async () => null };
    expect(await exportTextFile(env, 'x.ics', 'BEGIN', types)).toBe('cal.ics');
    expect(writes).toEqual(['BEGIN']);
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'x.ics', types }),
    );
  });

  it('exportTextFile downloads without the picker API', async () => {
    const download = vi.fn();
    expect(
      await exportTextFile({ download, pickFile: async () => null }, 'x.ics', 'T', types),
    ).toBe('x.ics');
    expect(download).toHaveBeenCalledWith('x.ics', 'T');
  });

  it('exportTextFile maps AbortError to null', async () => {
    const env: FileEnv = {
      showSaveFilePicker: () => Promise.reject(new DOMException('x', 'AbortError')),
      download: vi.fn(),
      pickFile: async () => null,
    };
    expect(await exportTextFile(env, 'x', 't', types)).toBeNull();
  });

  it('openTextFile reads through the open picker', async () => {
    const { handle } = fakeHandle('t.json', 'hello');
    const env: FileEnv = {
      showOpenFilePicker: async () => [handle],
      download: vi.fn(),
      pickFile: async () => null,
    };
    expect(await openTextFile(env, types)).toEqual({ name: 't.json', text: 'hello' });
  });

  it('openTextFile falls back to the input with the accept string', async () => {
    const pickFile = vi.fn(async () => new File(['abc'], 'f.ics'));
    const env: FileEnv = { download: vi.fn(), pickFile };
    expect(await openTextFile(env, types)).toEqual({ name: 'f.ics', text: 'abc' });
    expect(pickFile).toHaveBeenCalledWith('.ics,text/calendar');
    expect(await openTextFile({ download: vi.fn(), pickFile: async () => null }, types)).toBeNull();
  });

  it('openTextFile returns null on AbortError', async () => {
    const env: FileEnv = {
      showOpenFilePicker: () => Promise.reject(new DOMException('x', 'AbortError')),
      download: vi.fn(),
      pickFile: async () => null,
    };
    expect(await openTextFile(env, types)).toBeNull();
  });

  it('a workspace save after an export still writes to the workspace handle', async () => {
    const workspaceFile = fakeHandle('w.json');
    const exported = fakeHandle('cal.ics');
    const env: FileEnv = {
      showOpenFilePicker: async () => [workspaceFile.handle],
      showSaveFilePicker: async () => exported.handle,
      download: vi.fn(),
      pickFile: async () => null,
    };
    const svc = createFileService(env);
    await svc.open();
    await exportTextFile(env, 'cal.ics', 'X', types);
    await svc.save(ws, 'w.json');
    expect(workspaceFile.writes).toEqual([serialize(ws)]);
    expect(exported.writes).toEqual(['X']);
  });
});
