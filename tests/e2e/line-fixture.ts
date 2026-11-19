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
