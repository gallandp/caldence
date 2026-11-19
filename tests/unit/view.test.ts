import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyWorkspace, ORG_UNIT, type Workspace } from '../../src/core/model';
import { areaPage, currentView, openingPlace, withView } from '../../src/ui/state/view';

afterEach(() => {
  currentView.set({});
  areaPage.set('overview');
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
    expect(withView(ws).view).toEqual({ zoom: '2', page: 'calendar', areaPage: 'overview' });
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

const VIEWS = ['calendar', 'load', 'meetings', 'team', 'settings', 'templates', 'exchange'];

function planWith(areas: number, view?: Workspace['view']): Workspace {
  const ws = emptyWorkspace('2026-11-19');
  ws.teams = [{ id: 't1' }, { id: 't2' }] as never;
  ws.areas = Array.from({ length: areas }, (_, i) => ({ id: `a${i + 1}` })) as never;
  if (view) ws.view = view;
  return ws;
}

describe('openingPlace', () => {
  it('opens a file with an area on the first area, whatever it was saved on', () => {
    for (const page of ['settings', 'templates', 'exchange', 'load'])
      expect(openingPlace(planWith(2, { unit: 't2', page }), true, VIEWS)).toEqual({
        unit: 'a1',
        page: 'team',
      });
  });

  it('opens a file without an area on the Calendar of its saved team', () => {
    expect(openingPlace(planWith(0, { unit: 't2', page: 'settings' }), true, VIEWS)).toEqual({
      unit: 't2',
      page: 'calendar',
    });
    expect(openingPlace(planWith(0, { unit: 'gone' }), true, VIEWS)).toEqual({
      unit: undefined,
      page: 'calendar',
    });
  });

  it('brings a restored autosave back where the work was; unknown values are left out', () => {
    expect(openingPlace(planWith(1, { unit: 't2', page: 'settings' }), false, VIEWS)).toEqual({
      unit: 't2',
      page: 'settings',
    });
    expect(openingPlace(planWith(1, { unit: ORG_UNIT, page: 'load' }), false, VIEWS)).toEqual({
      unit: ORG_UNIT,
      page: 'load',
    });
    expect(openingPlace(planWith(0, { unit: 'gone', page: 'nowhere' }), false, VIEWS)).toEqual({
      unit: undefined,
      page: undefined,
    });
  });
});
