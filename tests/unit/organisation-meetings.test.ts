import { describe, expect, it } from 'vitest';
import { addAreaPerson, removeFromArea, setAreaHours } from '../../src/core/areaEdit';
import { costSummary } from '../../src/core/cost';
import { removeEvent, removeItem, renameOrganisation, upsertEvent } from '../../src/core/edit';
import { areaHints, areaHours, capacity, loadPerWeek, placesOf } from '../../src/core/load';
import { migrate } from '../../src/core/migrate';
import {
  CURRENT_SCHEMA,
  emptyWorkspace,
  hasOrgLevel,
  holders,
  missingRoles,
  ORG_UNIT,
  orgArea,
  units,
  unitLoadIds,
  type CalEvent,
  type Team,
  type Workspace,
} from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { areaStructure } from '../../src/core/structure';
import { validate } from '../../src/core/validate';
import { scopePeople, scopeUnits } from '../../src/core/views';
import { countChanges, effectScope, whatIfEffect } from '../../src/core/whatIf';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const team = (id: string, members: [string, string][]): Team => ({
  id,
  name: id,
  cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
  members: members.map(([personId, roleId]) => ({ personId, roleId })),
  memberHours: {},
  assumptions: {},
  cycles: [],
  events: [],
});

/** Portfolio sync: Mondays 1 h, the CEO, the RTE from every area and the PO from every team. */
const sync = (extra: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  name: 'Portfolio sync',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '10:00',
  duration: 60,
  participants: [
    { roleId: 'ceo', share: 1 },
    { roleId: 'rte', share: 1, fromAreas: true },
    { roleId: 'po', share: 1, fromTeams: true },
  ],
  preparation: 0,
  ...extra,
});

/**
 * Area North holds Alpha and Beta, area South holds Gamma, Delta is in no area. Alex is PO in
 * Alpha, Bo in Gamma, Dana in Delta; Rita is RTE of North (10 h), Ron of South (no hours);
 * Olga leads the organisation with 8 h there.
 */
function workspace(events: CalEvent[] = [sync()]): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' }; // four Mondays
  ws.settings.hourlyRate = 100;
  ws.roles = [
    { id: 'po', name: 'Product Owner', colour: '#2563eb' },
    { id: 'rte', name: 'RTE', colour: '#16a34a' },
    { id: 'ceo', name: 'Managing director', colour: '#9333ea' },
  ];
  ws.people = ['alex', 'bo', 'dana', 'rita', 'ron', 'olga'].map((id) => ({ id, name: id }));
  ws.categories = [{ id: 'c1', name: 'Sync', colour: '#2563eb' }];
  ws.teams = [
    team('alpha', [['alex', 'po']]),
    team('beta', []),
    team('gamma', [['bo', 'po']]),
    team('delta', [['dana', 'po']]),
  ];
  const area = (id: string, teamIds: string[], rte: string, hours?: number) => ({
    id,
    name: id,
    teamIds,
    members: [{ personId: rte, roleId: 'rte' }],
    memberHours: hours === undefined ? {} : { [rte]: hours },
    cycles: [],
    events: [],
  });
  ws.areas = [area('north', ['alpha', 'beta'], 'rita', 10), area('south', ['gamma'], 'ron')];
  ws.organisation = {
    name: 'Nordlicht',
    members: [{ personId: 'olga', roleId: 'ceo' }],
    memberHours: { olga: 8 },
    events,
  };
  return ws;
}

describe('organisation meetings and people (#328)', () => {
  it('invites a role from every area and from every team', () => {
    const ws = workspace();
    const [ceo, rte, po] = sync().participants;
    expect(holders(ws, ORG_UNIT, ceo!)).toEqual(['olga']);
    expect(holders(ws, ORG_UNIT, rte!)).toEqual(['rita', 'ron']);
    expect(holders(ws, ORG_UNIT, po!)).toEqual(['alex', 'bo', 'dana']);
    // Beta has no PO, and every area has its RTE.
    expect(missingRoles(ws, orgArea(ws), sync())).toEqual([{ teamId: 'beta', roleId: 'po' }]);
    // An area without the role invited "from every area" is named too.
    const noRte = workspace();
    noRte.areas[1]!.members = [];
    expect(missingRoles(noRte, orgArea(noRte), sync())).toEqual([
      { teamId: 'south', roleId: 'rte' },
      { teamId: 'beta', roleId: 'po' },
    ]);
  });

  it('is valid, and "from every area" only exists in the organisation', () => {
    const ws = workspace();
    expect(validate(ws).ok).toBe(true);
    const inArea = workspace([]);
    inArea.areas[0]!.events = [
      sync({ participants: [{ roleId: 'rte', share: 1, fromAreas: true }] }),
    ];
    const bad = validate(inArea);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.key).toBe('error.fromAreas.org');
    // Without a name, the organisation still holds its people and meetings.
    const unnamed = workspace();
    delete unnamed.organisation!.name;
    expect(validate(unnamed).ok).toBe(true);
    const wrongRef = workspace();
    wrongRef.organisation!.members = [{ personId: 'nobody', roleId: 'ceo' }];
    expect(validate(wrongRef).ok).toBe(false);
  });

  it('counts its meetings in the load of everyone who attends', () => {
    const ws = workspace();
    const weeks = loadPerWeek(ws, noIndex());
    expect(weeks).toHaveLength(4);
    for (const w of weeks) {
      expect(w.byTeamPerson[ORG_UNIT]).toEqual({
        olga: 1,
        rita: 1,
        ron: 1,
        alex: 1,
        bo: 1,
        dana: 1,
      });
      expect(w.byPerson.alex).toBe(1);
    }
    expect(unitLoadIds(ws, ORG_UNIT)).toContain(ORG_UNIT);
    expect(units(ws).map((u) => u.id)).toContain(ORG_UNIT);
  });

  it('has hours only where set on purpose', () => {
    const ws = workspace();
    expect(areaHours(ws, ORG_UNIT, 'olga')).toBe(8);
    expect(capacity(ws, 'olga')).toBe(8);
    expect(capacity(ws, 'olga', ORG_UNIT)).toBe(8);
    // Alex: 40 h in Alpha, no organisation hours.
    expect(capacity(ws, 'alex')).toBe(40);
    expect(placesOf(ws, 'olga')).toEqual(['Nordlicht']);
    const hints = areaHints(loadPerWeek(ws, noIndex()), ws).filter((h) => h.areaId === ORG_UNIT);
    expect(hints.map((h) => [h.personId, h.kind])).toEqual([
      ['alex', 'no-area-hours'],
      ['bo', 'no-area-hours'],
      ['dana', 'no-area-hours'],
      ['rita', 'no-area-hours'],
      // Ron has no hours anywhere.
      ['ron', 'no-hours'],
    ]);
  });

  it('costs count it for the organisation and its attendees, not for one area', () => {
    const ws = workspace();
    // Six people, 1 h a week, 100 € an hour.
    expect(costSummary(ws, noIndex(), { teamId: ORG_UNIT }, 100).perWeek).toBe(600);
    expect(costSummary(ws, noIndex(), {}, 100).perWeek).toBe(600);
    expect(costSummary(ws, noIndex(), { teamId: 'north' }, 100).perWeek).toBe(0);
    expect(costSummary(ws, noIndex(), { personId: 'alex' }, 100).perWeek).toBe(100);
    expect(scopeUnits(ws, { teamId: 'north' }).map((u) => u.id)).not.toContain(ORG_UNIT);
    expect(scopeUnits(ws, { personId: 'olga' }).map((u) => u.id)).toEqual([ORG_UNIT]);
    expect(scopePeople(ws, { teamId: ORG_UNIT }).has('olga')).toBe(true);
  });

  it('shows the what-if effect across all teams and areas', () => {
    const base = workspace();
    expect(effectScope(base, ORG_UNIT)).toBe(ORG_UNIT);
    const north = sync({ id: 'n1', participants: [{ roleId: 'rte', share: 1 }] });
    base.areas[0]!.events = [north];
    const before = whatIfEffect(base, noIndex(), ORG_UNIT, 100)!;
    // The organisation's sync (6 h) and North's own meeting (1 h).
    expect(before.hours).toBe(7);
    expect(before.cost?.perWeek).toBe(700);
    const [after] = upsertEvent(base, ORG_UNIT, sync({ duration: 30 }));
    expect(countChanges(base, after)).toBe(1);
    const effect = whatIfEffect(after, noIndex(), ORG_UNIT, 100)!;
    expect(effect.hours).toBe(4);
    expect(effect.cost?.perWeek).toBe(400);
    // Weekly hours of everyone: Alex, Bo and Dana 40 h in teams, Rita 10 h, Ron 0 h, Olga 8 h.
    expect(effect.share).toBeCloseTo(4 / 138);
  });

  it('lists who attends without hours there, until hours are set (#436)', () => {
    const ws = workspace();
    const invited = (w: Workspace) =>
      areaStructure(w, orgArea(w))
        .people.filter((p) => p.invitedOnly)
        .map((p) => p.personId);
    // Olga has a role and hours there; everyone else attends through "every area" or "every team".
    expect(invited(ws).sort()).toEqual(['alex', 'bo', 'dana', 'rita', 'ron']);
    const set = setAreaHours(ws, ORG_UNIT, 'rita', 2);
    expect(set.ok && invited(set.value)).toEqual(['alex', 'bo', 'dana', 'ron']);
    // Someone invited by name counts as well; once given hours there, they leave the list.
    const named = workspace([
      sync({
        participants: [
          { roleId: 'ceo', share: 1 },
          { personId: 'eve', share: 1 },
        ],
      }),
    ]);
    named.people.push({ id: 'eve', name: 'eve' });
    expect(invited(named)).toEqual(['eve']);
    const eveHours = setAreaHours(named, ORG_UNIT, 'eve', 1);
    expect(eveHours.ok && invited(eveHours.value)).toEqual([]);
  });

  it('is edited like an area', () => {
    const [withEvent, id] = upsertEvent(workspace([]), ORG_UNIT, sync({ id: '' }));
    expect(withEvent.organisation?.events?.map((e) => e.id)).toEqual([id]);
    expect(removeEvent(withEvent, ORG_UNIT, id).organisation?.events).toBeUndefined();
    const added = addAreaPerson(workspace(), ORG_UNIT, 'alex', 'ceo', 2);
    expect(added.ok && added.value.organisation?.memberHours).toEqual({ olga: 8, alex: 2 });
    if (!added.ok) return;
    const hours = setAreaHours(added.value, ORG_UNIT, 'alex', 3);
    expect(hours.ok && hours.value.organisation?.memberHours?.alex).toBe(3);
    const removed = removeFromArea(added.value, ORG_UNIT, 'olga');
    expect(removed.ok && removed.value.organisation?.members).toEqual([
      { personId: 'alex', roleId: 'ceo' },
    ]);
    const gone = removeItem(workspace(), 'people', 'olga');
    expect(gone.ok && gone.value.organisation?.members).toBeUndefined();
    expect(gone.ok && gone.value.organisation?.memberHours).toBeUndefined();
    // A replaced role or person follows into the organisation's people and meetings.
    const role = removeItem(workspace(), 'roles', 'ceo', 'rte');
    expect(role.ok && role.value.organisation?.members).toEqual([
      { personId: 'olga', roleId: 'rte' },
    ]);
    // The CEO row merges into "RTE from every area" and keeps that reach.
    expect(role.ok && role.value.organisation?.events?.[0]?.participants).toEqual([
      { roleId: 'rte', share: 1, fromAreas: true },
      { roleId: 'po', share: 1, fromTeams: true },
    ]);
    const person = removeItem(workspace(), 'people', 'olga', 'ron');
    expect(person.ok && person.value.organisation?.members).toEqual([
      { personId: 'ron', roleId: 'ceo' },
    ]);
    expect(person.ok && person.value.organisation?.memberHours).toEqual({ ron: 8 });
    // Clearing the name keeps the people and meetings.
    const cleared = renameOrganisation(workspace(), ' ');
    expect(cleared.ok && cleared.value.organisation?.name).toBeUndefined();
    expect(cleared.ok && cleared.value.organisation?.events).toHaveLength(1);
  });

  it('stays selectable while it has people or meetings of its own', () => {
    const ws = workspace();
    ws.areas = [];
    ws.teams = ws.teams.slice(0, 1);
    expect(hasOrgLevel(ws)).toBe(true);
    delete ws.organisation;
    expect(hasOrgLevel(ws)).toBe(false);
  });

  it('loads older files unchanged and bumps the schema', () => {
    expect(CURRENT_SCHEMA).toBeGreaterThanOrEqual(9);
    const old = { ...workspace(), schemaVersion: 8, organisation: { name: 'Nordlicht' } };
    const m = migrate(old);
    expect(m.ok && m.value).toEqual({ ...old, schemaVersion: CURRENT_SCHEMA });
  });
});
