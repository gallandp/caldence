import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { areaPage, currentView, withView } from '../../src/ui/state/view';

afterEach(() => {
  currentView.set({});
  areaPage.set('structure');
});

describe('withView', () => {
  it('writes the current unit, view and area page into the workspace', () => {
    const ws = emptyWorkspace('2026-11-07');
    currentView.set({ unit: 't1', page: 'load' });
    areaPage.set('overview');
    const saved = withView(ws);
    expect(saved.view).toEqual({ unit: 't1', page: 'load', areaPage: 'overview' });
    // The workspace in the store stays as it was.
    expect(ws.view).toBeUndefined();
  });

  it('keeps keys it does not know, for example from a newer version', () => {
    const ws = { ...emptyWorkspace('2026-11-07'), view: { zoom: '2' } as never };
    currentView.set({ page: 'calendar' });
    expect(withView(ws).view).toEqual({ zoom: '2', page: 'calendar', areaPage: 'structure' });
  });
});

describe('currentView', () => {
  it('notifies only when the place changes', () => {
    let calls = 0;
    const stop = currentView.subscribe(() => calls++);
    currentView.set({ unit: 'a', page: 'load' });
    currentView.set({ unit: 'a', page: 'load' });
    expect(calls).toBe(2);
    expect(get(currentView)).toEqual({ unit: 'a', page: 'load' });
    stop();
  });
});
