import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { areaPage, currentView, withView } from '../../src/ui/state/view';

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
});
