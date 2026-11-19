import { areaWorkspace } from './area-fixture';

/**
 * The area fixture plus an invented line (#316): the specialist group "Orvalis" with the line
 * teams "Orvalis Ware" (Alex, Sam, Kim, Lou) and "Orvalis Geld" (Mo, Nia, Ola); skills of the
 * family "Orvalis", two companies, and Kim at 0.8 FTE.
 */
export function lineWorkspace() {
  const ws = areaWorkspace() as ReturnType<typeof areaWorkspace> & Record<string, unknown>;
  ws.settings.locale = 'en';
  ws.skillFamilies = [{ id: 'sf1', name: 'Orvalis' }];
  ws.skills = [
    { id: 'sk1', name: 'Orvalis Lager', familyId: 'sf1' },
    { id: 'sk2', name: 'Orvalis Handel', familyId: 'sf1' },
    { id: 'sk3', name: 'Orvalis Betrieb', familyId: 'sf1' },
  ];
  ws.companies = [
    { id: 'co1', name: 'Velmora AG' },
    { id: 'co2', name: 'Velmora Digital GmbH' },
  ];
  ws.lineUnits = [
    { id: 'lu1', name: 'Orvalis', skillFamilyId: 'sf1', managerPersonId: 'person-ruth' },
    { id: 'lu2', name: 'Orvalis Ware', parentId: 'lu1', managerPersonId: 'person-alex' },
    { id: 'lu3', name: 'Orvalis Geld', parentId: 'lu1' },
  ];
  const line: Record<string, object> = {
    'person-alex': { lineUnitId: 'lu2', companyId: 'co1', skillIds: ['sk1'] },
    'person-sam': { lineUnitId: 'lu2', companyId: 'co1', skillIds: ['sk1', 'sk2'] },
    'person-kim': { lineUnitId: 'lu2', companyId: 'co2', contractFte: 0.8, skillIds: ['sk3'] },
    'person-lou': { lineUnitId: 'lu2', companyId: 'co2' },
    'person-mo': { lineUnitId: 'lu3', companyId: 'co1', skillIds: ['sk2'] },
    'person-nia': { lineUnitId: 'lu3', companyId: 'co2' },
    'person-ola': { lineUnitId: 'lu3', companyId: 'co1' },
  };
  ws.people = ws.people.map((p) => ({ ...p, ...line[p.id] }));
  return ws;
}

/**
 * The line fixture with open demands (#319): Payments asks for skills of the family Orvalis.
 * Alpha wants Orvalis Lager 1.0 and Orvalis Betrieb 0.5, Gamma Orvalis Lager 0.5 (Sam on it with
 * 0.2) and Delta Orvalis Handel 1.0 and a Scrum Master role only.
 */
export function staffingWorkspace() {
  const ws = lineWorkspace();
  const areas = ws.areas as { id: string; skillFamilyId?: string }[];
  areas.find((a) => a.id === 'area-payments')!.skillFamilyId = 'sf1';
  const team = (id: string) =>
    (
      ws.teams as unknown as {
        id: string;
        demands?: unknown[];
        members: unknown[];
        memberHours: Record<string, number>;
      }[]
    ).find((t) => t.id === id)!;
  team('team-alpha').demands = [
    { id: 'd1', skillId: 'sk1', fte: 1, roleId: 'role-dev' },
    { id: 'd2', skillId: 'sk3', fte: 0.5, roleId: 'role-dev' },
  ];
  const gamma = team('team-gamma');
  gamma.demands = [{ id: 'd1', skillId: 'sk1', fte: 0.5, roleId: 'role-dev' }];
  gamma.members.push({ personId: 'person-sam', roleId: 'role-dev' });
  gamma.memberHours['person-sam'] = 8;
  team('team-delta').demands = [
    { id: 'd1', skillId: 'sk2', fte: 1, roleId: 'role-dev' },
    { id: 'd2', fte: 0.5, roleId: 'role-sm' },
  ];
  ws.assignments = [
    { id: 'as1', personId: 'person-sam', teamId: 'team-gamma', demandId: 'd1', fte: 0.2 },
  ];
  return ws;
}
