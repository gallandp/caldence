// What the last .ics export of each scope wrote, per file and per browser, so that the next export
// of the same scope can send meetings that are gone as cancelled (#21). Not part of the file:
// it describes this person's calendar, not the plan.
import type { ExportedEvent } from '../../core/ics';
import type { Filter } from '../../core/views';

const KEY = 'caldence.exports.v1';
/** Scopes kept; the oldest go first. */
const MAX_SCOPES = 40;

type Store = Record<string, { at: number; events: ExportedEvent[] }>;

const scopeKey = (workspaceId: string, scope: Filter) =>
  `${workspaceId}|${scope.teamId ?? ''}|${scope.roleId ?? ''}|${scope.personId ?? ''}`;

// Reading localStorage itself throws when site data is blocked, so it is only touched inside a try.
function read(): Store {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Store) : {};
  } catch {
    return {};
  }
}

const text = (v: unknown) => typeof v === 'string';
/** Only well-formed entries are used: storage can be edited or written by an older version. */
function isExported(v: unknown): v is ExportedEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    text(e.uid) &&
    /^[^\r\n]+@caldence$/.test(e.uid as string) &&
    text(e.date) &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date as string) &&
    text(e.start) &&
    /^DTSTART[;:][^\r\n]*$/.test(e.start as string) &&
    text(e.end) &&
    /^DTEND[;:][^\r\n]*$/.test(e.end as string) &&
    text(e.summary) &&
    (e.key === undefined || text(e.key)) &&
    (e.sequence === undefined ||
      (Number.isSafeInteger(e.sequence) && (e.sequence as number) >= 0)) &&
    (e.hash === undefined || text(e.hash))
  );
}

/** The events of the last export of this scope; empty when there was none or storage is blocked. */
export function lastExport(workspaceId: string, scope: Filter): ExportedEvent[] {
  const events: unknown = read()[scopeKey(workspaceId, scope)]?.events;
  return Array.isArray(events) ? events.filter(isExported) : [];
}

/** Remembers what an export of this scope put into the calendar. */
export function rememberExport(workspaceId: string, scope: Filter, events: ExportedEvent[]): void {
  const store = read();
  store[scopeKey(workspaceId, scope)] = { at: Date.now(), events };
  const keep = Object.entries(store)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_SCOPES);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // Blocked or full storage: the next export cannot cancel, it still updates.
  }
}
