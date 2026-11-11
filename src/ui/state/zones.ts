import { isKnownZone } from '../../core/zone';

export const FALLBACK_ZONES = ['Europe/Berlin', 'Europe/London', 'Europe/Vienna', 'UTC'];

/** The IANA time zones this browser knows, or null when it cannot list them. */
export function supportedZones(): string[] | null {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf !== 'function') return null;
  try {
    const list = intl.supportedValuesOf('timeZone');
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

/** The time zone of this device, if the browser reports a known one. */
export function browserZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isKnownZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
