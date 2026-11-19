import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from '../../src/ui/state/route';

const views = ['calendar', 'team', 'load'];

describe('routes (#401)', () => {
  it('writes view, unit and page, keeping @ and : readable', () => {
    expect(formatRoute({ view: 'calendar' })).toBe('#/calendar');
    expect(formatRoute({ view: 'team', unit: 'a2', page: 'structure' })).toBe(
      '#/team/a2/structure',
    );
    expect(formatRoute({ view: 'load', unit: '@line:l3' })).toBe('#/load/@line:l3');
    expect(formatRoute({ view: 'team', page: 'overview' })).toBe('#/team');
  });

  it('reads back what it writes, odd ids included', () => {
    for (const route of [
      { view: 'team', unit: '@organisation', page: 'overview' },
      { view: 'calendar', unit: 'x/y z#ä' },
      { view: 'load' },
    ])
      expect(parseRoute(formatRoute(route), views)).toEqual({
        unit: undefined,
        page: undefined,
        ...route,
      });
  });

  it('ignores addresses that name no known view', () => {
    expect(parseRoute('', views)).toBeUndefined();
    expect(parseRoute('#top', views)).toBeUndefined();
    expect(parseRoute('#/nope/t1', views)).toBeUndefined();
    expect(parseRoute('#/team/%E0%A4%A', views)).toBeUndefined();
  });
});
