import example from '../../src/data/examples/example.caldence.json' with { type: 'json' };

/**
 * The example plus an area "Payments" of four teams with a 10-week cadence: Alpha and Beta in
 * step, Gamma with 3-week sprints, Delta starting on Wednesdays; area roles and meetings.
 */
export function areaWorkspace() {
  const ws = structuredClone(example) as Omit<typeof example, 'areas'> & { areas: unknown[] };
  const alpha = ws.teams[0]!;
  alpha.cadence = { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' };
  const copy = (id: string, name: string, cadence: typeof alpha.cadence, people: string[]) => ({
    ...structuredClone(alpha),
    id,
    name,
    cadence,
    members: [
      { personId: people[0]!, roleId: 'role-po' },
      { personId: people[1]!, roleId: 'role-sm' },
    ],
    memberHours: { [people[0]!]: 20, [people[1]!]: 20 },
    events: alpha.events.filter((e) => e.rule.type !== 'cycle-milestone'),
  });
  ws.people.push(
    { id: 'person-kim', name: 'Kim' },
    { id: 'person-lou', name: 'Lou' },
    { id: 'person-mo', name: 'Mo' },
    { id: 'person-nia', name: 'Nia' },
    { id: 'person-ola', name: 'Ola' },
    { id: 'person-pia', name: 'Pia' },
    { id: 'person-ruth', name: 'Ruth' },
  );
  ws.roles.push({ id: 'role-head', name: 'Head of area', colour: '#0b7a6b' });
  ws.teams.push(
    copy('team-gamma', 'Team Gamma', { kind: 'sprint', lengthWeeks: 3, start: '2027-01-04' }, [
      'person-kim',
      'person-lou',
    ]) as (typeof ws.teams)[number],
    copy('team-delta', 'Team Delta', { kind: 'flow', lengthWeeks: 2, start: '2027-01-06' }, [
      'person-mo',
      'person-nia',
    ]) as (typeof ws.teams)[number],
  );
  ws.areas = [
    {
      id: 'area-payments',
      name: 'Payments',
      teamIds: ['team-alpha', 'team-beta', 'team-gamma', 'team-delta'],
      cadence: { kind: 'pi', lengthWeeks: 10, start: '2027-01-04' },
      members: [
        { personId: 'person-ruth', roleId: 'role-head' },
        { personId: 'person-pia', roleId: 'role-po' },
        { personId: 'person-alex', roleId: 'role-po' },
      ],
      memberHours: { 'person-ruth': 32, 'person-alex': 4 },
      cycles: [],
      events: [
        {
          id: 'ev-po-forum',
          name: 'PO forum',
          categoryId: 'cat-align',
          rule: { type: 'weekly', weekday: 2 },
          time: '10:00',
          duration: 60,
          participants: [
            { roleId: 'role-head', share: 1 },
            { roleId: 'role-po', share: 1, fromTeams: true },
          ],
          preparation: 0,
        },
        {
          id: 'ev-scrum-of-scrums',
          name: 'Scrum of Scrums',
          categoryId: 'cat-align',
          rule: { type: 'weekly', weekday: 4 },
          time: '09:30',
          duration: 30,
          participants: [{ roleId: 'role-sm', share: 1, fromTeams: true }],
          preparation: 0,
        },
        {
          id: 'ev-planning',
          name: 'PI Planning',
          categoryId: 'cat-events',
          rule: { type: 'once', date: '2027-03-15' },
          time: '09:00',
          duration: 480,
          participants: [
            { roleId: 'role-head', share: 1 },
            { roleId: 'role-dev', share: 1, fromTeams: true },
          ],
          preparation: 0,
        },
      ],
    },
  ];
  return ws;
}
