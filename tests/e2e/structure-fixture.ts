/**
 * A workspace with the area "Payments" and its teams, like the structure prototype: Sabine and
 * Jonas work only in the area, the POs and SMs also work in it, everyone else only in a team.
 * With `teams: 9` five more small teams join the area.
 */
export function structureWorkspace(opts: { teams?: 4 | 9; locale?: 'de' | 'en' } = {}) {
  const roles = [
    ['po', 'Product Owner', '#2563eb'],
    ['sm', 'Scrum Master', '#15803d'],
    ['dev', 'Developer', '#7c3aed'],
    ['qa', 'Tester', '#b45309'],
    ['lead', 'Head of area', '#0b7a6b'],
    ['rte', 'Release Train Engineer', '#0e7490'],
    ['pm', 'Product Management', '#9d174d'],
  ].map(([id, name, colour]) => ({ id, name, colour }));
  // [person id, name, role, team hours, area hours, area role]
  type M = [string, string, string, number, number, string?];
  const base: { id: string; name: string; m: M[] }[] = [
    {
      id: 'alpha',
      name: 'Alpha',
      m: [
        ['alex', 'Alex B.', 'po', 20, 4],
        ['lea', 'Lea T.', 'dev', 20, 20, 'pm'],
        ['sam', 'Sam R.', 'sm', 16, 2],
        ['mira', 'Mira D.', 'dev', 40, 0],
        ['tom', 'Tom E.', 'dev', 40, 0],
      ],
    },
    {
      id: 'beta',
      name: 'Beta',
      m: [
        ['bea', 'Bea H.', 'po', 32, 4],
        ['sam', 'Sam R.', 'sm', 16, 2],
        ['chris', 'Chris J.', 'dev', 40, 0],
        ['gero', 'Gero O.', 'qa', 40, 0],
      ],
    },
    {
      id: 'gamma',
      name: 'Gamma',
      m: [
        ['hanna', 'Hanna P.', 'po', 36, 4],
        ['ivo', 'Ivo Q.', 'sm', 30, 0],
        ['jule', 'Jule S.', 'dev', 40, 0],
      ],
    },
    // Delta has no Scrum Master: the Scrum of Scrums misses it.
    {
      id: 'delta',
      name: 'Delta',
      m: [
        ['omar', 'Omar X.', 'po', 30, 4],
        ['pia', 'Pia Y.', 'dev', 40, 0],
      ],
    },
  ];
  const extra = ['Epsilon', 'Zeta', 'Eta', 'Theta', 'Web Widgets'].map((name, i) => ({
    id: name.toLowerCase().replace(' ', '-'),
    name,
    m: [
      [`po${i}`, `${['Uwe', 'Vera', 'Wim', 'Xenia', 'Yusuf'][i]} M.`, 'po', 32, 4],
      [`sm${i}`, `${['Zoe', 'Arne', 'Britt', 'Cem', 'Dora'][i]} N.`, 'sm', 30, 0],
      [
        `dev${i}`,
        `${['Eli', 'Finn', 'Wanda', 'Hugo', 'Ida'][i]} ${i === 2 ? 'W' : 'R'}.`,
        'dev',
        40,
        0,
      ],
    ] as M[],
  }));
  const teams = opts.teams === 9 ? [...base, ...extra] : base;
  const people = new Map<string, string>([
    ['sabine', 'Sabine K.'],
    ['jonas', 'Jonas M.'],
  ]);
  for (const t of teams) for (const [id, name] of t.m) people.set(id, name);
  const areaMembers = [
    { personId: 'sabine', roleId: 'lead' },
    { personId: 'jonas', roleId: 'rte' },
  ];
  const areaHours: Record<string, number> = { sabine: 40, jonas: 32 };
  for (const t of teams)
    for (const [id, , , , ah, ar] of t.m) {
      if (ar && !areaMembers.some((m) => m.personId === id))
        areaMembers.push({ personId: id, roleId: ar });
      if (ah > 0) areaHours[id] = ah;
    }
  const event = (id: string, name: string, participants: unknown[]) => ({
    id,
    name,
    categoryId: 'c1',
    rule: { type: 'weekly', weekday: 2 },
    time: '10:00',
    duration: 60,
    participants,
    preparation: 0,
  });
  return {
    schemaVersion: 7,
    id: '6f0b0e1c-56a8-4bd5-9d5b-0c3c1b1f1a11',
    settings: {
      locale: opts.locale ?? 'en',
      region: 'de-sn',
      timezone: 'Europe/Berlin',
      workdays: [1, 2, 3, 4, 5],
      hoursPerWeek: 40,
      horizon: { from: '2026-01-05', to: '2026-12-31' },
      skipHolidays: true,
      thresholds: { warnFactor: 1.5, maxFte: 0.6 },
    },
    roles,
    people: [...people].map(([id, name]) => ({ id, name })),
    categories: [{ id: 'c1', name: 'Sync', colour: '#3366cc' }],
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2026-01-05' },
      members: t.m.map(([personId, , roleId]) => ({ personId, roleId })),
      memberHours: Object.fromEntries(t.m.map(([id, , , h]) => [id, h])),
      assumptions: {},
      cycles: [],
      events: [],
    })),
    areas: [
      {
        id: 'payments',
        name: 'Payments',
        teamIds: teams.map((t) => t.id),
        cadence: { kind: 'pi', lengthWeeks: 10, start: '2026-01-05' },
        members: areaMembers,
        memberHours: areaHours,
        cycles: [],
        events: [
          event('po-forum', 'PO forum', [
            { roleId: 'pm', share: 1 },
            { roleId: 'po', share: 1, fromTeams: true },
          ]),
          event('sos', 'Scrum of Scrums', [
            { roleId: 'rte', share: 1 },
            { roleId: 'sm', share: 1, fromTeams: true },
          ]),
        ],
      },
    ],
    customRegions: [],
  };
}
