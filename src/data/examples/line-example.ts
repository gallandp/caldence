import {
  CURRENT_SCHEMA,
  type CalEvent,
  type Rule,
  type Team,
  type Workspace,
} from '../../core/model';

/**
 * The invented line organisation example (#323): the Velmora Group with three affiliated
 * companies, 11 platforms with 61 products, about 500 people in 12 line teams, skills, demands
 * and assignments. Every name is made up. Generated with a fixed seed, so every run gives the
 * same file; it is also the fixture of the performance budget (#315).
 *
 * It holds the workshop cases of the click dummy (design/line-staffing/):
 * - Anna Becker has 0.2 FTE free, Ordermatik (Scrum) needs 0.4 FTE "Orvalis Lager" (open).
 * - Ben Hoffmann is in Lagerlicht and Partnerhafen; Routenwerk's open "Orvalis Handel" demand
 *   would make him a member of a third product (context switch).
 * - Kim Lehmann is fully booked (1.0 FTE in Ordermatik).
 * - Selin Arslan is Product Owner of Ordermatik and Lagerlicht without explicit hours, so free
 *   FTE counts a full week in each and shows her overbooked.
 * - Lagerlicht's "Orvalis Lager" demand is fully staffed, Ordermatik's is open; Routenwerk has a
 *   role-only demand (Scrum Master · 0.5).
 * - Partnerhafen misses its technical owner; Torwacht wants only a technical owner.
 *
 * Imports only the model: the end-to-end tests import this file directly.
 */

type Locale = 'de' | 'en';
type Text = readonly [de: string, en: string];

const FAMILIES: Record<string, Text> = {
  kern: ['Kernsystem Orvalis', 'Orvalis core system'],
  inf: ['Infrastruktur', 'Infrastructure'],
  sw: ['Software', 'Software'],
  hw: ['Hardware', 'Hardware'],
};

const SKILLS: Record<string, [Text, family: string]> = {
  lag: [['Orvalis Lager', 'Orvalis Warehouse'], 'kern'],
  han: [['Orvalis Handel', 'Orvalis Trade'], 'kern'],
  kon: [['Orvalis Konten', 'Orvalis Accounts'], 'kern'],
  per: [['Orvalis Personal', 'Orvalis Staff'], 'kern'],
  bet: [['Orvalis Betrieb', 'Orvalis Operations'], 'kern'],
  skr: [['Orvalis Skript', 'Orvalis Script'], 'kern'],
  net: [['Netzbau', 'Network building'], 'inf'],
  wol: [['Wolkenbetrieb', 'Cloud operations'], 'inf'],
  end: [['Endgeräte', 'End devices'], 'inf'],
  sch: [['Schutzschild', 'Shield'], 'inf'],
  kl: [['Kernlogik', 'Core logic'], 'sw'],
  ob: [['Oberflächen', 'Interfaces'], 'sw'],
  pa: [['Prüfautomatik', 'Test automation'], 'sw'],
  nf: [['Nutzerforschung', 'User research'], 'sw'],
  df: [['Datenflüsse', 'Data flows'], 'sw'],
  sk: [['Schaltkreise', 'Circuits'], 'hw'],
  as: [['Anlagensteuerung', 'Plant control'], 'hw'],
  cc: [['Chipcode', 'Chip code'], 'hw'],
};

const COMPANIES = { va: 'Velmora AG', vd: 'Velmora Digital GmbH', vt: 'Velmora Technik GmbH' };

/** Specialist groups and their line teams: name, lead, skills and head count. */
const LINE: {
  id: string;
  name: Text;
  lead: string;
  family: string;
  teams: { id: string; name: Text; lead: string; skills: string[]; n: number }[];
}[] = [
  {
    id: 'fg-kern',
    name: ['Fachgruppe Orvalis', 'Orvalis group'],
    lead: 'Martina Roth',
    family: 'kern',
    teams: [
      {
        id: 'lt-ware',
        name: ['Orvalis Ware', 'Orvalis Goods'],
        lead: 'Jana Krüger',
        skills: ['lag', 'han', 'skr', 'bet'],
        n: 42,
      },
      {
        id: 'lt-geld',
        name: ['Orvalis Geld', 'Orvalis Money'],
        lead: 'Tom Berger',
        skills: ['kon', 'skr', 'bet'],
        n: 40,
      },
      {
        id: 'lt-markt',
        name: ['Orvalis Markt & Mensch', 'Orvalis Market & People'],
        lead: 'Selma Aydin',
        skills: ['han', 'per', 'skr'],
        n: 41,
      },
    ],
  },
  {
    id: 'fg-inf',
    name: ['Fachgruppe Infrastruktur', 'Infrastructure group'],
    lead: 'Olaf Peters',
    family: 'inf',
    teams: [
      {
        id: 'lt-net',
        name: ['Netze', 'Networks'],
        lead: 'Murat Yilmaz',
        skills: ['net', 'sch'],
        n: 38,
      },
      {
        id: 'lt-wol',
        name: ['Wolke & Rechenzentrum', 'Cloud & Data Centre'],
        lead: 'Lena Vogt',
        skills: ['wol', 'sch', 'net'],
        n: 44,
      },
      {
        id: 'lt-end',
        name: ['Endgeräte', 'End Devices'],
        lead: 'Nils Ebert',
        skills: ['end', 'net'],
        n: 36,
      },
    ],
  },
  {
    id: 'fg-sw',
    name: ['Fachgruppe Software', 'Software group'],
    lead: 'Ines Wagner',
    family: 'sw',
    teams: [
      {
        id: 'lt-kl',
        name: ['Kernlogik', 'Core Logic'],
        lead: 'Paul Schmitt',
        skills: ['kl', 'pa'],
        n: 45,
      },
      {
        id: 'lt-ob',
        name: ['Oberflächen', 'Interfaces'],
        lead: 'Carla Mendes',
        skills: ['ob', 'kl', 'nf'],
        n: 43,
      },
      {
        id: 'lt-pa',
        name: ['Prüfung & Forschung', 'Testing & Research'],
        lead: 'Sara Neumann',
        skills: ['pa', 'nf'],
        n: 39,
      },
      {
        id: 'lt-df',
        name: ['Datenflüsse', 'Data Flows'],
        lead: 'Henrik Olsen',
        skills: ['df', 'kl'],
        n: 42,
      },
    ],
  },
  {
    id: 'fg-hw',
    name: ['Fachgruppe Hardware', 'Hardware group'],
    lead: 'Dirk Sommer',
    family: 'hw',
    teams: [
      {
        id: 'lt-as',
        name: ['Anlagen', 'Plants'],
        lead: 'Petra Albrecht',
        skills: ['as', 'sk'],
        n: 40,
      },
      { id: 'lt-cc', name: ['Chips', 'Chips'], lead: 'Kai Brenner', skills: ['cc', 'sk'], n: 41 },
    ],
  },
];

/** Platforms: id, name, skill family, planning interval or not, products, skills. */
const PLATFORMS: [string, string, string, boolean, string[], string[]][] = [
  [
    'wf',
    'Warenfluss',
    'kern',
    true,
    ['Ordermatik', 'Lagerlicht', 'Partnerhafen', 'Routenwerk', 'Torwacht', 'Zählstern'],
    ['lag', 'han', 'skr', 'bet'],
  ],
  [
    'zw',
    'Zahlwerk',
    'kern',
    true,
    ['Kontenkern', 'Belegfabrik', 'Spesenwiege', 'Abschlussturm', 'Budgetkompass', 'Wertregister'],
    ['kon', 'skr', 'bet'],
  ],
  [
    'ks',
    'Kundenstrom',
    'kern',
    false,
    ['Angebotsschmiede', 'Auftragsband', 'Preisgarten', 'Kundenarchiv', 'Rücklauf', 'Bonusrad'],
    ['han', 'skr', 'kon'],
  ],
  [
    'mw',
    'Menschenwerk',
    'kern',
    false,
    ['Zeitfaden', 'Lohnlinie', 'Talenthafen', 'Teamportal'],
    ['per', 'skr'],
  ],
  [
    'ng',
    'Netzgarten',
    'inf',
    false,
    ['Standortnetz', 'Funkfeld', 'Gerätepark', 'Hilfedesk', 'Sprachkanal'],
    ['net', 'end', 'sch'],
  ],
  [
    'wh',
    'Wolkenhof',
    'inf',
    true,
    [
      'Wolkenbasis',
      'Sicherungskeller',
      'Wachposten',
      'Schlüsselbund',
      'Containerhafen',
      'Schutzwall',
    ],
    ['wol', 'net', 'sch'],
  ],
  [
    'kt',
    'Kundentür',
    'sw',
    true,
    ['Selbstservice-App', 'Anliegenbox', 'Kundenkonto', 'Schaufenstermeile', 'Plauderbot'],
    ['kl', 'ob', 'pa', 'nf'],
  ],
  [
    'uw',
    'Unterwegs',
    'sw',
    false,
    ['Technikerblick', 'Flottenblick', 'Regalblick', 'Scanstift', 'Offline-Brücke'],
    ['ob', 'kl', 'pa'],
  ],
  [
    'dh',
    'Datenbucht',
    'sw',
    true,
    [
      'Datensee',
      'Berichtswerk',
      'Prognoskop',
      'Stammdatenpflege',
      'Datenkatalog',
      'Kennzahlenwand',
    ],
    ['df', 'kl', 'pa'],
  ],
  [
    'wk',
    'Werkhalle',
    'hw',
    false,
    ['Halle Nord', 'Halle Süd', 'Prüffeld', 'Energiewaage', 'Wartungswerk'],
    ['as', 'sk'],
  ],
  [
    'tw',
    'Tiefwerk',
    'hw',
    false,
    [
      'Fühlerwerk',
      'Steuerkern',
      'Funkupdate',
      'Testgestell',
      'Funkknoten',
      'Ladepunkt',
      'Spurfunk',
    ],
    ['cc', 'sk'],
  ],
];

const FIRST = [
  'Anna',
  'Ben',
  'Clara',
  'David',
  'Eva',
  'Felix',
  'Gina',
  'Hans',
  'Ilka',
  'Jonas',
  'Kim',
  'Lars',
  'Mia',
  'Nora',
  'Otto',
  'Pia',
  'Rafael',
  'Sophie',
  'Tim',
  'Ute',
  'Vera',
  'Willi',
  'Yara',
  'Zoe',
  'Aylin',
  'Bastian',
  'Chiara',
  'Deniz',
  'Emil',
  'Frieda',
  'Gregor',
  'Hannah',
  'Ismail',
  'Jule',
  'Kemal',
  'Lea',
  'Malte',
  'Nele',
  'Ole',
  'Paula',
  'Quentin',
  'Rosa',
  'Sven',
  'Tamara',
  'Umut',
  'Valentin',
  'Wiebke',
  'Xenia',
  'Yusuf',
  'Zara',
];
const LAST = [
  'Becker',
  'Hoffmann',
  'Wolf',
  'Lang',
  'Richter',
  'Brandt',
  'Schulz',
  'Meier',
  'Kraus',
  'Weber',
  'Fischer',
  'Koch',
  'Bauer',
  'Klein',
  'Wolff',
  'Zimmer',
  'Neumann',
  'Schwarz',
  'Braun',
  'Hartmann',
  'Krüger',
  'Lange',
  'Werner',
  'Schmitz',
  'Krause',
  'Lehmann',
  'Köhler',
  'Herrmann',
  'König',
  'Walter',
  'Mayer',
  'Huber',
  'Kaiser',
  'Fuchs',
  'Peters',
  'Scholz',
  'Möller',
  'Weiß',
  'Jung',
  'Hahn',
  'Vogel',
  'Friedrich',
  'Keller',
  'Günther',
  'Frank',
  'Berger',
  'Winkler',
  'Roth',
  'Beck',
  'Lorenz',
];

/** Meeting names that differ between the languages (the rest are the same in both). */
const MEETING: Record<string, Text> = {
  stakeholder: ['Stakeholder-Sync', 'Stakeholder sync'],
  poSync: ['PO-Sync', 'PO sync'],
  tech: ['Tech-Runde', 'Tech round'],
  demoPrep: ['Demo-Vorbereitung', 'Demo prep'],
  flowSync: ['Fluss-Sync', 'Flow sync'],
  poRound: ['PO-Runde', 'PO round'],
  demo: ['Systemdemo', 'System demo'],
  platformRound: ['Plattform-Runde', 'Platform round'],
  quarter: ['Quartalsplanung', 'Quarterly planning'],
  ops: ['Betriebsübergabe', 'Operations handover'],
};

const START = '2027-01-04';
const HPW = 40;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The example in the given UI language (names of skills, line units, roles and meetings). */
export function lineExampleWorkspace(locale: Locale = 'de'): Workspace {
  const L = (t: Text): string => (locale === 'en' ? t[1] : t[0]);
  // mulberry32: a small seeded generator, so the file is the same on every run and browser.
  let seed = 7;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const shuffled = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  // ---------- people and the line ----------
  const people: Workspace['people'] = [];
  const used = new Set<string>();
  const person = (name: string | null, extra: Partial<Workspace['people'][number]> = {}) => {
    let n = name;
    if (n === null)
      do n = `${pick(FIRST)} ${pick(LAST)}`;
      while (used.has(n));
    used.add(n);
    const id = `p${people.length + 1}`;
    people.push({ id, name: n, ...extra });
    return id;
  };
  const reserved = ['Anna Becker', 'Ben Hoffmann', 'Kim Lehmann', 'Selin Arslan', 'Jonas Wolf'];
  for (const n of [...reserved, ...LINE.flatMap((g) => [g.lead, ...g.teams.map((t) => t.lead)])])
    used.add(n);

  // The whole line under one root, so one selection shows all of it (#316).
  const lineUnits: NonNullable<Workspace['lineUnits']> = [
    { id: 'lv', name: L(['Velmora Verbund', 'Velmora Alliance']) },
  ];
  /** Line staff by skill, for staffing; free FTE tracked while assigning. */
  const staff: { id: string; skills: string[]; free: number }[] = [];
  for (const g of LINE) {
    const groupLead = person(g.lead, { lineUnitId: g.id, companyId: 'va' });
    lineUnits.push({
      id: g.id,
      name: L(g.name),
      parentId: 'lv',
      managerPersonId: groupLead,
      skillFamilyId: g.family,
    });
    for (const t of g.teams) {
      const lead = person(t.lead, { lineUnitId: t.id, companyId: g.family === 'hw' ? 'vt' : 'va' });
      lineUnits.push({ id: t.id, name: L(t.name), parentId: g.id, managerPersonId: lead });
      for (let i = 0; i < t.n; i++) {
        const s1 = pick(t.skills);
        const skillIds = rnd() < 0.35 ? [...new Set([s1, pick(t.skills)])] : [s1];
        const k = people.length % 10;
        const companyId =
          g.family === 'hw'
            ? k < 7
              ? 'vt'
              : 'va'
            : g.family === 'kern'
              ? k < 9
                ? 'va'
                : 'vd'
              : k < 6
                ? 'vd'
                : 'va';
        const fte = pick([1, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0.5]);
        const id = person(null, {
          lineUnitId: t.id,
          companyId,
          ...(fte < 1 ? { contractFte: fte } : {}),
          skillIds,
        });
        staff.push({ id, skills: skillIds, free: fte });
      }
    }
  }
  const anna = person('Anna Becker', { lineUnitId: 'lt-ware', companyId: 'va', skillIds: ['lag'] });
  const ben = person('Ben Hoffmann', {
    lineUnitId: 'lt-ware',
    companyId: 'va',
    skillIds: ['lag', 'han'],
  });
  const kim = person('Kim Lehmann', { lineUnitId: 'lt-ware', companyId: 'va', skillIds: ['skr'] });
  const selin = person('Selin Arslan', { lineUnitId: 'lt-ware', companyId: 'va' });

  // ---------- meetings ----------
  const ev = (
    id: string,
    name: string,
    rule: Rule,
    duration: number,
    roleIds: string[],
    categoryId = 'c-scrum',
    fromTeams = false,
  ): CalEvent => ({
    id,
    name,
    categoryId,
    rule,
    time: duration >= 240 ? '09:00' : '10:00',
    duration,
    participants: roleIds.map((roleId) => ({
      roleId,
      share: 1,
      ...(fromTeams ? { fromTeams } : {}),
    })),
    preparation: duration >= 60 ? 0.1 : 0,
  });
  const all = ['dev', 'sm', 'po', 'tpo'];
  const owners = ['po', 'tpo'];
  const shared = (): CalEvent[] => [
    ev('e-daily', 'Daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15, ['dev', 'sm']),
    ev(
      'e-ops',
      L(MEETING.ops!),
      { type: 'monthly-nth-weekday', weekday: 3, nth: 2 },
      30,
      ['dev', 'tpo'],
      'c-align',
    ),
    ev(
      'e-stake',
      L(MEETING.stakeholder!),
      { type: 'monthly-nth-weekday', weekday: 2, nth: 1 },
      60,
      owners,
      'c-align',
    ),
    ev(
      'e-tech',
      L(MEETING.tech!),
      { type: 'every-n-weeks', weekday: 4, n: 2, anchor: '2027-01-07' },
      60,
      ['dev', 'tpo'],
      'c-align',
    ),
    ev(
      'e-po',
      L(MEETING.poSync!),
      { type: 'weekly', weekday: 2 },
      30,
      [...owners, 'sm'],
      'c-align',
    ),
  ];
  const SYSTEMS: Record<string, { cadence: Team['cadence']; events: () => CalEvent[] }> = {
    s2: {
      cadence: { kind: 'sprint', lengthWeeks: 2, start: START },
      events: () => [
        ...shared(),
        ev('e-plan', 'Sprint Planning', { type: 'cadence-day', day: 0 }, 120, all),
        ev('e-review', 'Review', { type: 'cadence-day', day: 11 }, 60, all),
        ev('e-retro', 'Retro', { type: 'cadence-day', day: 11 }, 90, ['dev', 'sm']),
        ev('e-refine', 'Refinement', { type: 'weekly', weekday: 3 }, 90, ['dev', 'po', 'tpo']),
        ev(
          'e-demo',
          L(MEETING.demoPrep!),
          { type: 'cadence-day', day: 10 },
          30,
          [...owners, 'sm'],
          'c-align',
        ),
      ],
    },
    s3: {
      cadence: { kind: 'sprint', lengthWeeks: 3, start: START },
      events: () => [
        ...shared(),
        ev('e-plan', 'Sprint Planning', { type: 'cadence-day', day: 0 }, 180, all),
        ev('e-review', 'Review', { type: 'cadence-day', day: 18 }, 90, all),
        ev('e-retro', 'Retro', { type: 'cadence-day', day: 18 }, 90, ['dev', 'sm']),
        ev('e-refine', 'Refinement', { type: 'weekly', weekday: 3 }, 60, ['dev', 'po', 'tpo']),
        ev(
          'e-demo',
          L(MEETING.demoPrep!),
          { type: 'cadence-day', day: 17 },
          30,
          [...owners, 'sm'],
          'c-align',
        ),
      ],
    },
    kb: {
      cadence: { kind: 'flow', lengthWeeks: 2, start: START },
      events: () => [
        ...shared(),
        ev('e-repl', 'Replenishment', { type: 'weekly', weekday: 1 }, 60, ['dev', 'po', 'tpo']),
        ev(
          'e-service',
          'Service Review',
          { type: 'every-n-weeks', weekday: 5, n: 2, anchor: '2027-01-08' },
          60,
          all,
        ),
        ev('e-retro', 'Retro', { type: 'monthly-nth-weekday', weekday: 4, nth: -1 }, 90, [
          'dev',
          'sm',
        ]),
        ev(
          'e-flow',
          L(MEETING.flowSync!),
          { type: 'weekly', weekday: 3 },
          30,
          ['sm', 'po'],
          'c-align',
        ),
      ],
    },
  };

  // ---------- platforms, products, demands ----------
  const teams: Team[] = [];
  const areas: Workspace['areas'] = [];
  const locked = new Set<string>(); // "teamId/demandId" the generator leaves alone
  let sm = '';
  for (const [aid, name, family, pi, products, skills] of PLATFORMS) {
    const teamIds: string[] = [];
    for (const productName of products) {
      const id = `t${teams.length + 1}`;
      teamIds.push(id);
      const sys =
        name === 'Warenfluss' && productName === 'Ordermatik'
          ? 's2'
          : pick(['s2', 's2', 's2', 's3', 'kb', 'kb']);
      // One Scrum Master for two products, half a week each.
      if (teams.length % 2 === 0) sm = person(null);
      const n = teams.length;
      const ownerMode = n % 9 === 4 ? 'technical' : n % 13 === 7 ? 'business' : 'both';
      const members: Team['members'] = [];
      if (ownerMode !== 'technical') members.push({ personId: person(null), roleId: 'po' });
      if (ownerMode !== 'business' && (n % 7 !== 5 || ownerMode === 'technical'))
        members.push({ personId: person(null), roleId: 'tpo' });
      members.push({ personId: sm, roleId: 'sm' });
      const k = 2 + Math.floor(rnd() * 2);
      const demandSkills = shuffled([...skills]).slice(0, k);
      teams.push({
        id,
        name: productName,
        cadence: { ...SYSTEMS[sys]!.cadence },
        members,
        memberHours: { [sm]: 20 },
        assumptions: {},
        cycles: [],
        events: SYSTEMS[sys]!.events(),
        demands: demandSkills.map((skillId, j) => ({
          id: `d${j + 1}`,
          skillId,
          fte: j === 0 ? pick([2, 3, 3, 4, 4, 5]) : pick([0.5, 1, 1, 2, 2]),
          roleId: 'dev',
        })),
        ...(ownerMode === 'both' ? {} : { ownerMode }),
      });
    }
    const owners: Workspace['areas'][number]['members'] = [
      { personId: person(null), roleId: 'plo' },
    ];
    if (rnd() < 0.85) owners.push({ personId: person(null), roleId: 'tpl' });
    areas.push({
      id: `a-${aid}`,
      name,
      teamIds,
      skillFamilyId: family,
      ...(pi ? { cadence: { kind: 'pi', lengthWeeks: 10, start: START } } : {}),
      members: owners,
      memberHours: Object.fromEntries(owners.map((o) => [o.personId, 20])),
      cycles: [],
      events: [
        ev(
          'ae-sos',
          'Scrum of Scrums',
          { type: 'weekly', weekday: 2 },
          30,
          ['sm'],
          'c-platform',
          true,
        ),
        ev(
          'ae-po',
          L(MEETING.poRound!),
          { type: 'weekly', weekday: 4 },
          60,
          ['po', 'tpo'],
          'c-platform',
          true,
        ),
        pi
          ? ev(
              'ae-plan',
              'PI Planning',
              { type: 'cadence-day', day: 0 },
              480,
              ['dev', 'sm', 'po', 'tpo'],
              'c-platform',
              true,
            )
          : ev(
              'ae-plan',
              L(MEETING.quarter!),
              { type: 'every-n-weeks', weekday: 2, n: 13, anchor: '2027-01-05' },
              240,
              ['sm', 'po', 'tpo'],
              'c-platform',
              true,
            ),
        ev(
          'ae-demo',
          L(MEETING.demo!),
          { type: 'every-n-weeks', weekday: 5, n: 2, anchor: '2027-01-15' },
          60,
          ['po', 'tpo'],
          'c-platform',
          true,
        ),
        ev(
          'ae-round',
          L(MEETING.platformRound!),
          { type: 'monthly-nth-weekday', weekday: 1, nth: -1 },
          90,
          ['plo', 'tpl'],
          'c-platform',
        ),
      ],
    });
  }

  // ---------- the workshop cases ----------
  const team = (n: string): Team => teams.find((t) => t.name === n)!;
  const om = team('Ordermatik');
  const ll = team('Lagerlicht');
  const ph = team('Partnerhafen');
  const rw = team('Routenwerk');
  const tw = team('Torwacht');
  const dev = (skillId: string, fte: number, id: string) => ({ id, skillId, fte, roleId: 'dev' });
  om.demands = [dev('lag', 0.4, 'd1'), dev('skr', 2, 'd2'), dev('bet', 0.3, 'd3')];
  ll.demands = [dev('lag', 1.3, 'd1'), dev('bet', 0.5, 'd2')];
  ph.demands = [dev('han', 1.5, 'd1'), dev('lag', 1, 'd2')];
  rw.demands = [dev('han', 0.5, 'd1'), dev('skr', 1, 'd2'), { id: 'd3', fte: 0.5, roleId: 'sm' }];
  locked.add(`${om.id}/d1`).add(`${rw.id}/d1`).add(`${rw.id}/d3`);
  // Routenwerk waits for a Scrum Master (the role-only demand) and has none yet.
  rw.members = rw.members.filter((m) => m.roleId !== 'sm');
  rw.memberHours = {};
  // Ordermatik and Lagerlicht share Selin as Product Owner, without hours: a full week in each.
  // Jonas Wolf is Ordermatik's technical owner.
  for (const t of [om, ll])
    t.members = t.members.filter((m) => m.roleId !== 'po' && m.roleId !== 'tpo');
  om.members.unshift(
    { personId: selin, roleId: 'po' },
    { personId: person('Jonas Wolf'), roleId: 'tpo' },
  );
  ll.members.unshift({ personId: selin, roleId: 'po' }, { personId: person(null), roleId: 'tpo' });
  delete om.ownerMode;
  delete ll.ownerMode;
  // Partnerhafen wants a tandem and misses its technical owner; Torwacht wants only a technical one.
  ph.members = ph.members.filter((m) => m.roleId !== 'tpo');
  if (!ph.members.some((m) => m.roleId === 'po'))
    ph.members.unshift({ personId: person(null), roleId: 'po' });
  delete ph.ownerMode;
  tw.ownerMode = 'technical';
  tw.members = tw.members.filter((m) => m.roleId !== 'po');
  if (!tw.members.some((m) => m.roleId === 'tpo'))
    tw.members.unshift({ personId: person(null), roleId: 'tpo' });

  // ---------- assignments ----------
  const assignments: NonNullable<Workspace['assignments']> = [];
  const staffOn = (t: Team, demandId: string, personId: string, fte: number) => {
    const roleId = t.demands!.find((d) => d.id === demandId)!.roleId;
    t.members.push({ personId, roleId });
    t.memberHours[personId] = round2(fte * HPW);
    assignments.push({ id: `as${assignments.length + 1}`, personId, teamId: t.id, demandId, fte });
  };
  staffOn(ll, 'd1', anna, 0.8);
  staffOn(ll, 'd1', ben, 0.5);
  staffOn(ph, 'd1', ben, 0.3);
  staffOn(om, 'd2', kim, 1);
  for (const t of teams)
    for (const d of t.demands ?? []) {
      if (locked.has(`${t.id}/${d.id}`) || !d.skillId) continue;
      const staffed = assignments.filter((a) => a.teamId === t.id && a.demandId === d.id);
      let need = round1(
        d.fte * pick([0.5, 0.7, 0.8, 1, 1, 1, 1]) - staffed.reduce((s, a) => s + a.fte, 0),
      );
      for (const p of shuffled(staff.filter((s) => s.skills.includes(d.skillId!)))) {
        if (need < 0.1) break;
        if (p.free < 0.1 || t.members.some((m) => m.personId === p.id)) continue;
        const fte = round1(Math.min(p.free, need, pick([0.5, 0.8, 1, 1, 1, 1])));
        // At least half a week: a few hours in a product mostly go to its meetings.
        if (fte < 0.5) continue;
        staffOn(t, d.id, p.id, fte);
        p.free = round1(p.free - fte);
        need = round1(need - fte);
      }
    }

  // Product Owners replaced by the cases above belong to no unit any more.
  const inUnit = new Set([...teams, ...areas].flatMap((u) => u.members.map((m) => m.personId)));
  const kept = people.filter((p) => p.lineUnitId || inUnit.has(p.id));

  return {
    schemaVersion: CURRENT_SCHEMA,
    id: '6c1f0e2a-3b4d-4c5e-8f60-7a8b9c0d1e2f',
    settings: {
      locale,
      region: 'de-sn',
      timezone: 'Europe/Berlin',
      workdays: [1, 2, 3, 4, 5],
      hoursPerWeek: HPW,
      horizon: { from: '2027-01-01', to: '2027-12-31' },
      skipHolidays: true,
      thresholds: { warnFactor: 1.5, maxFte: 0.6 },
      levelNames: { preset: 'platform' },
    },
    roles: [
      { id: 'po', name: 'Product Owner', colour: '#1d4ed8', owner: 'business' },
      {
        id: 'tpo',
        name: L(['Technischer Product Owner', 'Technical Product Owner']),
        colour: '#0e7490',
        owner: 'technical',
      },
      { id: 'sm', name: 'Scrum Master', colour: '#7e22ce' },
      { id: 'dev', name: L(['Entwicklungsteam', 'Development team']), colour: '#15803d' },
      {
        id: 'plo',
        name: L(['Plattform Owner', 'Platform Owner']),
        colour: '#b45309',
        owner: 'business',
      },
      {
        id: 'tpl',
        name: L(['Technischer Plattform Owner', 'Technical Platform Owner']),
        colour: '#a16207',
        owner: 'technical',
      },
    ],
    people: kept,
    categories: [
      { id: 'c-scrum', name: L(['Scrum-Events', 'Scrum events']), colour: '#1d4ed8' },
      { id: 'c-align', name: L(['Abstimmung', 'Alignment']), colour: '#15803d' },
      { id: 'c-platform', name: L(['Plattform', 'Platform']), colour: '#b45309' },
    ],
    teams,
    areas,
    customRegions: [],
    organisation: { name: L(['Velmora Gruppe', 'Velmora Group']) },
    lineUnits,
    skillFamilies: Object.entries(FAMILIES).map(([id, n]) => ({ id, name: L(n) })),
    skills: Object.entries(SKILLS).map(([id, [n, familyId]]) => ({ id, name: L(n), familyId })),
    companies: Object.entries(COMPANIES).map(([id, name]) => ({ id, name })),
    assignments,
    view: { unit: '@organisation', page: 'team' },
  };
}
