import { effectiveDuration } from './recurrence';
import {
  areaAsTeam,
  participantName,
  type Area,
  type CalEvent,
  type Participant,
  type Team,
  type Workspace,
} from './model';
import type { Cell, Sheet } from './xlsx';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface SheetText {
  t: Translate;
  /** How a meeting repeats, in words (the meetings table's summary). */
  repeats: (event: CalEvent, unit: Team) => string;
  /** A share of a meeting, e.g. 0.5 → "50%". */
  percent: (share: number) => string;
}

/** A unit in file order: each area followed by its teams, then the teams outside any area. */
interface Row {
  area: Area | undefined;
  team: Team | undefined;
}

function unitsInOrder(ws: Workspace): Row[] {
  const out: Row[] = [];
  for (const area of ws.areas) {
    out.push({ area, team: undefined });
    for (const id of area.teamIds) {
      const team = ws.teams.find((x) => x.id === id);
      if (team) out.push({ area, team });
    }
  }
  const grouped = new Set(ws.areas.flatMap((a) => a.teamIds));
  for (const team of ws.teams) if (!grouped.has(team.id)) out.push({ area: undefined, team });
  return out;
}

/** People of a unit in member order, each once, with all their roles. */
function peopleOf(
  ws: Workspace,
  members: { personId: string; roleId: string }[],
): { personId: string; roles: string[] }[] {
  const out = new Map<string, string[]>();
  for (const m of members) {
    const role = ws.roles.find((r) => r.id === m.roleId)?.name ?? '';
    const roles = out.get(m.personId) ?? [];
    if (role && !roles.includes(role)) roles.push(role);
    out.set(m.personId, roles);
  }
  return [...out].map(([personId, roles]) => ({ personId, roles }));
}

function participantText(ws: Workspace, p: Participant, text: SheetText): string {
  const name = participantName(ws, p);
  const who = p.fromAreas
    ? text.t('org.fromAreas', { role: name })
    : p.fromTeams
      ? text.t('area.fromTeams', { role: name })
      : name;
  return p.share >= 1 ? who : `${who} (${text.percent(p.share)})`;
}

/**
 * The structure of a file as three flat tables for a spreadsheet: people per unit, the units, and
 * the meetings. Headers use the level names; hours follow the app (a team member without own
 * hours has the file's weekly hours, an area member 0).
 */
export function structureSheets(ws: Workspace, text: SheetText): Sheet[] {
  const { t } = text;
  const units = unitsInOrder(ws);
  const personName = (id: string) => ws.people.find((p) => p.id === id)?.name ?? id;
  const labels = (r: Row): [Cell, Cell] => [r.area?.name ?? null, r.team?.name ?? null];

  const structure: Cell[][] = [];
  for (const r of units) {
    const unit = r.team ?? r.area!;
    const people = peopleOf(ws, unit.members);
    // An area's own row only when it has people or no teams, so empty rows do not pile up.
    if (people.length === 0 && (r.team || r.area!.teamIds.length === 0)) {
      structure.push([...labels(r), null, null, null]);
      continue;
    }
    for (const p of people) {
      const own = unit.memberHours[p.personId];
      const hours = own ?? (r.team ? ws.settings.hoursPerWeek : 0);
      structure.push([...labels(r), personName(p.personId), p.roles.join(', '), hours]);
    }
  }

  const unitRows: Cell[][] = units.map((r) => {
    const unit = r.team ?? r.area!;
    const cadence = r.team?.cadence ?? r.area!.cadence;
    return [
      r.team ? (r.area?.name ?? null) : null,
      unit.name,
      t(r.team ? 'xlsx.level.team' : 'xlsx.level.area'),
      cadence ? t('team.cadence.kind.' + cadence.kind) : null,
      cadence ? cadence.lengthWeeks : null,
      cadence ? cadence.start : null,
      peopleOf(ws, unit.members).length,
      unit.events.length,
    ];
  });

  const meetings: Cell[][] = [];
  for (const r of units) {
    const unit = r.team ?? areaAsTeam(r.area!);
    for (const e of r.team?.events ?? r.area!.events) {
      meetings.push([
        ...labels(r),
        e.name,
        ws.categories.find((c) => c.id === e.categoryId)?.name ?? null,
        text.repeats(e, unit),
        e.time,
        effectiveDuration(e, unit),
        Math.round(e.preparation * 100),
        e.participants.map((p) => participantText(ws, p, text)).join(', '),
      ]);
    }
  }

  return [
    {
      name: t('xlsx.sheet.structure'),
      columns: [
        t('xlsx.col.area'),
        t('xlsx.col.team'),
        t('xlsx.col.person'),
        t('xlsx.col.roles'),
        t('xlsx.col.hours'),
      ],
      rows: structure,
    },
    {
      name: t('xlsx.sheet.units'),
      columns: [
        t('xlsx.col.area'),
        t('xlsx.col.name'),
        t('xlsx.col.level'),
        t('xlsx.col.cadence'),
        t('xlsx.col.cadenceWeeks'),
        t('xlsx.col.cadenceStart'),
        t('xlsx.col.people'),
        t('xlsx.col.meetings'),
      ],
      rows: unitRows,
    },
    {
      name: t('xlsx.sheet.meetings'),
      columns: [
        t('xlsx.col.area'),
        t('xlsx.col.team'),
        t('xlsx.col.meeting'),
        t('xlsx.col.category'),
        t('xlsx.col.repeats'),
        t('xlsx.col.start'),
        t('xlsx.col.duration'),
        t('xlsx.col.preparation'),
        t('xlsx.col.participants'),
      ],
      rows: meetings,
    },
  ];
}
