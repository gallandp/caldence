import type { CalEvent, Rule, Team, Workspace } from '../../src/core/model';

/**
 * A generated workspace at the target scale of the line organisation epic (#315): 11 platforms
 * with 61 products, about 500 people, about 600 meetings, a one-year horizon, a line tree with
 * skills and companies, demands and assignments. All names are invented. The curated example
 * file comes later (#323); this one only has to be big and realistic in shape.
 */
export function perfWorkspace(): Workspace {
  const syl = ['ka', 'lo', 'mi', 'ra', 've', 'to', 'su', 'ne', 'di', 'ar', 'el', 'on'];
  const word = (n: number): string => {
    const s = syl[n % 12]! + syl[Math.floor(n / 12) % 12]! + syl[(n * 7 + 3) % 12]!;
    return s[0]!.toUpperCase() + s.slice(1);
  };
  const people: Workspace['people'] = [];
  const person = (extra: Partial<Workspace['people'][number]> = {}): string => {
    const id = `p${people.length + 1}`;
    people.push({ id, name: `${word(people.length)} ${word(people.length * 5 + 1)}`, ...extra });
    return id;
  };

  const roles = [
    { id: 'po', name: 'Product Owner', colour: '#1d4ed8' },
    { id: 'sm', name: 'Scrum Master', colour: '#7e22ce' },
    { id: 'dev', name: 'Entwicklungsteam', colour: '#15803d' },
    { id: 'pl', name: 'Plattform Owner', colour: '#b45309' },
  ];
  const categories = [
    { id: 'c1', name: 'Scrum', colour: '#1d4ed8' },
    { id: 'c2', name: 'Abstimmung', colour: '#15803d' },
  ];
  const skillFamilies = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: word(i + 40) }));
  const skills = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`,
    name: `${word(i + 60)} ${i}`,
    familyId: `f${i % 6}`,
  }));
  const companies = [
    { id: 'co1', name: 'Velmora Nord' },
    { id: 'co2', name: 'Velmora Süd' },
    { id: 'co3', name: 'Velmora Digital' },
  ];
  const lineUnits: NonNullable<Workspace['lineUnits']> = [];
  for (let g = 0; g < 10; g++) {
    lineUnits.push({ id: `g${g}`, name: `Fachgruppe ${word(g + 80)}`, skillFamilyId: `f${g % 6}` });
    for (let l = 0; l < 4; l++)
      lineUnits.push({
        id: `l${g}-${l}`,
        name: `Linienteam ${word(g * 4 + l + 90)}`,
        parentId: `g${g}`,
        managerPersonId: person({ lineUnitId: `g${g}`, companyId: companies[g % 3]!.id }),
      });
  }
  const lineTeams = lineUnits.filter((u) => u.parentId !== undefined);

  const ev = (
    id: string,
    name: string,
    rule: Rule,
    duration: number,
    roleIds: string[],
    cat = 'c1',
    fromTeams = false,
  ): CalEvent => ({
    id,
    name,
    categoryId: cat,
    rule,
    time: '10:00',
    duration,
    participants: roleIds.map((roleId) => ({
      roleId,
      share: 1,
      ...(fromTeams ? { fromTeams } : {}),
    })),
    preparation: 0.1,
  });
  const teamEvents = (): CalEvent[] => [
    ev('e1', 'Daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15, ['dev', 'sm', 'po']),
    ev('e2', 'Planning', { type: 'cadence-day', day: 0 }, 120, ['dev', 'sm', 'po']),
    ev('e3', 'Review', { type: 'cadence-day', day: 11 }, 60, ['dev', 'sm', 'po']),
    ev('e4', 'Retro', { type: 'cadence-day', day: 11 }, 90, ['dev', 'sm']),
    ev('e5', 'Refinement', { type: 'weekly', weekday: 3 }, 60, ['dev', 'po']),
    ev('e6', 'PO-Sync', { type: 'weekly', weekday: 2 }, 30, ['po', 'sm'], 'c2'),
    ev(
      'e7',
      'Tech-Runde',
      { type: 'every-n-weeks', weekday: 4, n: 2, anchor: '2027-01-07' },
      60,
      ['dev'],
      'c2',
    ),
    ev('e8', 'Stakeholder', { type: 'monthly-nth-weekday', weekday: 1, nth: 1 }, 60, ['po'], 'c2'),
    ev('e9', 'Demo-Prep', { type: 'cadence-day', day: 10 }, 30, ['po', 'sm'], 'c2'),
  ];

  const teams: Team[] = [];
  const areas: Workspace['areas'] = [];
  const assignments: NonNullable<Workspace['assignments']> = [];
  let devNo = 0;
  let sm = '';
  for (let a = 0; a < 11; a++) {
    const teamIds: string[] = [];
    const count = a < 6 ? 6 : 5; // 6 × 6 + 5 × 5 = 61 products
    for (let k = 0; k < count; k++) {
      const id = `t${teams.length + 1}`;
      teamIds.push(id);
      if (teams.length % 2 === 0) sm = person();
      const po = person();
      const demands = [0, 1, 2].map((d) => ({
        id: `d${d}`,
        skillId: `s${(teams.length * 3 + d) % 30}`,
        fte: 2,
        roleId: 'dev',
      }));
      const team: Team = {
        id,
        name: `Produkt ${word(teams.length + 120)}`,
        cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
        members: [
          { personId: po, roleId: 'po' },
          { personId: sm, roleId: 'sm' },
        ],
        memberHours: { [sm]: 20 },
        assumptions: {},
        cycles: [],
        events: teamEvents(),
        demands,
      };
      for (let d = 0; d < 6; d++) {
        const line = lineTeams[devNo % lineTeams.length]!;
        const dev = person({
          lineUnitId: line.id,
          companyId: companies[devNo % 3]!.id,
          contractFte: devNo % 7 === 0 ? 0.8 : 1,
          skillIds: [...new Set([demands[d % 3]!.skillId, `s${(devNo + 11) % 30}`])],
        });
        devNo++;
        team.members.push({ personId: dev, roleId: 'dev' });
        team.memberHours[dev] = devNo % 7 === 1 ? 32 : 40;
        assignments.push({
          id: `as${assignments.length + 1}`,
          personId: dev,
          teamId: id,
          demandId: `d${d % 3}`,
          fte: team.memberHours[dev]! / 40,
        });
      }
      teams.push(team);
    }
    const owner = person();
    areas.push({
      id: `a${a + 1}`,
      name: `Plattform ${word(a + 200)}`,
      teamIds,
      skillFamilyId: `f${a % 6}`,
      cadence: { kind: 'pi', lengthWeeks: 10, start: '2027-01-04' },
      members: [{ personId: owner, roleId: 'pl' }],
      memberHours: { [owner]: 40 },
      cycles: [],
      events: [
        ev('ae1', 'Scrum of Scrums', { type: 'weekly', weekday: 2 }, 30, ['sm'], 'c2', true),
        ev('ae2', 'PO-Runde', { type: 'weekly', weekday: 4 }, 60, ['po'], 'c2', true),
        ev(
          'ae3',
          'PI Planning',
          { type: 'cadence-day', day: 0 },
          480,
          ['dev', 'po', 'sm'],
          'c1',
          true,
        ),
        ev(
          'ae4',
          'Systemdemo',
          { type: 'every-n-weeks', weekday: 5, n: 2, anchor: '2027-01-15' },
          60,
          ['po'],
          'c2',
          true,
        ),
        ev('ae5', 'Plattform-Runde', { type: 'monthly-nth-weekday', weekday: 1, nth: -1 }, 90, [
          'pl',
        ]),
      ],
    });
  }

  return {
    schemaVersion: 7,
    id: '0f2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d',
    settings: {
      locale: 'de',
      region: 'de-sn',
      timezone: 'Europe/Berlin',
      workdays: [1, 2, 3, 4, 5],
      hoursPerWeek: 40,
      horizon: { from: '2027-01-01', to: '2027-12-31' },
      skipHolidays: true,
      thresholds: { warnFactor: 1.5, maxFte: 0.6 },
      levelNames: { preset: 'platform' },
    },
    roles,
    people,
    categories,
    teams,
    areas,
    customRegions: [],
    organisation: { name: 'Velmora Gruppe' },
    lineUnits,
    skillFamilies,
    skills,
    companies,
    assignments,
  };
}
