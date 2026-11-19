import type { ContextOverride, Team, Workspace } from './model';
import { record } from './record';

/**
 * Context switching (#321): a person who works in many teams at once loses time to switching
 * between them. The hint uses Gerald Weinberg's rule of thumb (Quality Software Management, 1992)
 * and is a percentage and a text only: it is not a measurement, does not weigh how a person's
 * hours are split, and is never added to any other figure.
 */

/** Hint from this many teams unless Settings say otherwise (Philipp, 2026-11-18). */
export const DEFAULT_CONTEXT_SWITCH = 3;
export const MIN_CONTEXT_SWITCH = 2;

/** Weinberg: share of the working time lost by 1, 2, 3, 4 and 5 or more parallel tasks. */
const WEINBERG = [0, 0, 0.2, 0.4, 0.6, 0.75] as const;

export function contextLoss(teams: number): number {
  if (teams <= 1) return 0;
  return WEINBERG[Math.min(teams, WEINBERG.length - 1)]!;
}

/** From how many teams a person gets the hint. */
export function contextThreshold(ws: Workspace): number {
  return ws.settings.thresholds.contextSwitch ?? DEFAULT_CONTEXT_SWITCH;
}

/** The distinct teams a person is a member of; area-only membership does not count. */
export function teamCount(ws: Workspace, personId: string): number {
  return ws.teams.filter((t) => t.members.some((m) => m.personId === personId)).length;
}

/** The override on a person's membership in a team, while it still holds. */
export function contextOverride(
  ws: Workspace,
  teamId: string,
  personId: string,
): ContextOverride | undefined {
  const team = ws.teams.find((t) => t.id === teamId);
  const o = team?.contextOverrides?.[personId];
  if (!team || !o || !Object.hasOwn(team.contextOverrides!, personId)) return undefined;
  return o.teams === teamCount(ws, personId) && team.members.some((m) => m.personId === personId)
    ? o
    : undefined;
}

export interface ContextHint {
  personId: string;
  teams: number;
  /** Weinberg's share of time lost, e.g. 0.4. */
  loss: number;
  /** The team whose membership carries a holding override, if any. */
  overriddenIn?: string;
}

/** The hint for a person, or null below the threshold. */
export function contextHint(ws: Workspace, personId: string): ContextHint | null {
  const teams = teamCount(ws, personId);
  if (teams < contextThreshold(ws)) return null;
  const overriddenIn = ws.teams.find((t) => contextOverride(ws, t.id, personId))?.id;
  return {
    personId,
    teams,
    loss: contextLoss(teams),
    ...(overriddenIn ? { overriddenIn } : {}),
  };
}

/** Hints for all people at or above the threshold, in people order. */
export function contextHints(ws: Workspace): ContextHint[] {
  return ws.people.flatMap((p) => contextHint(ws, p.id) ?? []);
}

/**
 * The hint that adding a person to one more team would bring, counting that team; null when
 * they are already in it or stay below the threshold.
 */
export function contextHintIfAdded(
  ws: Workspace,
  personId: string | undefined,
  teamId: string,
): ContextHint | null {
  if (personId === undefined) return null;
  const team = ws.teams.find((t) => t.id === teamId);
  if (!team || team.members.some((m) => m.personId === personId)) return null;
  const teams = teamCount(ws, personId) + 1;
  if (teams < contextThreshold(ws)) return null;
  return { personId, teams, loss: contextLoss(teams) };
}

/**
 * Overrides the hint on a person's membership in a team (reason optional), or with `null`
 * takes the override back. The person must be a member of the team.
 */
export function setContextOverride(
  ws: Workspace,
  teamId: string,
  personId: string,
  reason: string | null,
): Workspace {
  const out = structuredClone(ws);
  const team = out.teams.find((t) => t.id === teamId);
  if (!team || !team.members.some((m) => m.personId === personId)) return out;
  const next = Object.assign(record<ContextOverride>(), team.contextOverrides);
  if (reason === null) delete next[personId];
  else {
    const text = reason.trim();
    next[personId] = { teams: teamCount(out, personId), ...(text ? { reason: text } : {}) };
  }
  if (Object.keys(next).length > 0) team.contextOverrides = next;
  else delete team.contextOverrides;
  return out;
}

/** A person's membership in a team: their roles there and their hours entry. */
function membership(team: Team, personId: string): string {
  return JSON.stringify([
    team.members.filter((m) => m.personId === personId).map((m) => m.roleId),
    Object.hasOwn(team.memberHours, personId) ? team.memberHours[personId] : null,
  ]);
}

/**
 * Drops overrides that no longer hold: the person left the team, their number of teams changed,
 * or (compared with `before`) their roles or hours in that team changed. Returns `ws` itself
 * when nothing is dropped.
 */
export function pruneContextOverrides(ws: Workspace, before?: Workspace): Workspace {
  const stale = (team: Team, personId: string, o: ContextOverride): boolean => {
    if (!team.members.some((m) => m.personId === personId)) return true;
    if (o.teams !== teamCount(ws, personId)) return true;
    const old = before?.teams.find((t) => t.id === team.id);
    const oldO = old?.contextOverrides?.[personId];
    // An override set in this very change belongs to the membership as it is now.
    if (!old || !oldO || JSON.stringify(oldO) !== JSON.stringify(o)) return false;
    return membership(old, personId) !== membership(team, personId);
  };
  if (
    !ws.teams.some(
      (t) =>
        t.contextOverrides && Object.entries(t.contextOverrides).some(([id, o]) => stale(t, id, o)),
    )
  )
    return ws;
  const out = structuredClone(ws);
  out.teams.forEach((team, i) => {
    const src = ws.teams[i]!;
    if (!src.contextOverrides) return;
    const next = record<ContextOverride>();
    for (const [id, o] of Object.entries(src.contextOverrides))
      if (!stale(src, id, o)) next[id] = structuredClone(o);
    if (Object.keys(next).length > 0) team.contextOverrides = next;
    else delete team.contextOverrides;
  });
  return out;
}
