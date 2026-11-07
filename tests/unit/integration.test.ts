import { describe, expect, it } from 'vitest';
import deSnJson from '../../src/data/regions/de-sn.json';
import { diffDays } from '../../src/core/date';
import { loadPerWeek } from '../../src/core/load';
import { occurrences } from '../../src/core/recurrence';
import { holidayIndex, validateRegion } from '../../src/core/regions';
import { loadWorkspace } from '../../src/core/validate';

const region = validateRegion(deSnJson);
if (!region.ok) throw new Error('de-sn invalid');

// 2027-02-01 is a Monday; Feb 1 – Mar 14 2027 contains no Saxon public holidays.
const START = '2027-02-01';
const workspaceJson = JSON.stringify({
  schemaVersion: 2,
  id: 'ws-test',
  settings: {
    locale: 'en',
    region: 'de-sn',
    timezone: 'Europe/Berlin',
    workdays: [1, 2, 3, 4, 5],
    hoursPerWeek: 40,
    horizon: { from: START, to: '2027-03-14' },
    skipHolidays: true,
    thresholds: { warnFactor: 1.5, maxFte: 0.6 },
  },
  roles: [{ id: 'r1', name: 'Developer', colour: '#336699' }],
  people: [{ id: 'p1', name: 'Pat', hoursPerWeek: 40 }],
  categories: [{ id: 'c1', name: 'Ceremonies', colour: '#993366' }],
  teams: [
    {
      id: 't1',
      name: 'Team',
      cadence: { kind: 'sprint', lengthWeeks: 2, start: START },
      members: [{ personId: 'p1', roleId: 'r1' }],
      assumptions: {},
      cycles: [],
      events: [
        {
          id: 'e1',
          name: 'Sprint Planning',
          categoryId: 'c1',
          rule: { type: 'cadence-day', day: 0 },
          time: '10:00',
          duration: 60,
          participants: [{ roleId: 'r1', share: 1 }],
          preparation: 0,
        },
      ],
    },
  ],
});

describe('cadence-day 0 end to end', () => {
  it('falls on the cadence start every 14 days and alternates weekly hours', () => {
    const loaded = loadWorkspace(workspaceJson);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    const ws = loaded.value;
    const index = holidayIndex(region.value, ws.settings.horizon.from, ws.settings.horizon.to);
    const team = ws.teams[0]!;

    const dates = occurrences(team, ws.settings, index).map((o) => o.date);
    expect(dates).toEqual(['2027-02-01', '2027-02-15', '2027-03-01']);
    for (const d of dates) expect(diffDays(d, START) % 14).toBe(0);

    const hours = loadPerWeek(ws, index).map((w) => w.byPerson['p1']);
    expect(hours).toEqual([1, 0, 1, 0, 1, 0]);
  });
});
