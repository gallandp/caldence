import { readFileSync } from 'node:fs';

/**
 * The example with a line (#318): Commerce has the invented skill family "Ledgerline"; Team Delta
 * runs two-week sprints whose developers attend a daily, planning, review and retro, and asks for
 * Ledgerline Booking (Robin and Jordan committed) and a Scrum Master role only.
 */
export function demandWorkspace(locale: 'en' | 'de' = 'en') {
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  ws.settings.locale = locale;
  ws.skillFamilies = [
    { id: 'f-ledger', name: 'Ledgerline' },
    { id: 'f-net', name: 'Netwright' },
  ];
  ws.skills = [
    { id: 's-book', name: 'Ledgerline Booking', familyId: 'f-ledger' },
    { id: 's-ops', name: 'Ledgerline Ops', familyId: 'f-ledger' },
    { id: 's-route', name: 'Netwright Routing', familyId: 'f-net' },
  ];
  ws.areas.find((a: { id: string }) => a.id === 'area-commerce').skillFamilyId = 'f-ledger';
  const delta = ws.teams.find((t: { id: string }) => t.id === 'team-delta');
  delta.cadence = { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' };
  const cat = ws.categories[0].id;
  const dev = (id: string, name: string, rule: unknown, duration: number) => ({
    id,
    name,
    categoryId: cat,
    rule,
    time: '10:00',
    duration,
    preparation: 0,
    participants: [{ roleId: 'role-dev', share: 1 }],
  });
  delta.events.push(
    dev('ev-daily', 'Daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15),
    dev('ev-plan', 'Sprint Planning', { type: 'cadence-day', day: 1 }, 120),
    dev('ev-review', 'Sprint Review', { type: 'cadence-day', day: 10 }, 60),
    dev('ev-retro', 'Retrospective', { type: 'cadence-day', day: 10 }, 60),
  );
  delta.members.push({ personId: 'person-jordan', roleId: 'role-dev' });
  delta.memberHours['person-jordan'] = 20;
  delta.demands = [
    { id: 'd1', skillId: 's-book', fte: 1.5, roleId: 'role-dev' },
    { id: 'd2', fte: 0.5, roleId: 'role-sm' },
  ];
  ws.assignments = [
    { id: 'as1', personId: 'person-robin', teamId: 'team-delta', demandId: 'd1', fte: 0.2 },
    { id: 'as2', personId: 'person-jordan', teamId: 'team-delta', demandId: 'd1', fte: 0.5 },
  ];
  return ws;
}
