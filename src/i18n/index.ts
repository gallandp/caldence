import { derived, writable } from 'svelte/store';
import { diffDays, type ISODate } from '../core/date';
import type { Settings } from '../core/model';
import de from './de.json';
import en from './en.json';
import { levelParams, levelWords, type LevelWords } from './levels';

export type Locale = 'de' | 'en';
type Params = Record<string, string | number>;

const catalogues: Record<Locale, Record<string, string>> = { de, en };

export function detectLocale(settings?: Settings, languages?: readonly string[]): Locale {
  if (settings) return settings.locale;
  const list = languages ?? (typeof navigator !== 'undefined' ? navigator.languages : []);
  for (const lang of list) {
    const primary = lang.toLowerCase().split('-')[0];
    if (primary === 'de' || primary === 'en') return primary;
  }
  return 'en';
}

/** `fallback` fills placeholders that `params` leaves open (the level names, see `translate`). */
export function t(locale: Locale, key: string, params?: Params, fallback?: Params): string {
  const text = catalogues[locale][key];
  if (text === undefined) return key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (params && name in params) return String(params[name]);
    if (fallback && name in fallback) return String(fallback[name]);
    return whole;
  });
}

export function formatDisplayDate(locale: Locale, d: ISODate, style: 'short' | 'long'): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, day));
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(utc);
}

/**
 * The planning horizon as cost labels name it: "2027, 52 Wo." for a full calendar year,
 * otherwise "01.03.2027–30.05.2027, 13 Wo.".
 */
export function formatHorizon(locale: Locale, horizon: { from: ISODate; to: ISODate }): string {
  const { from, to } = horizon;
  const year = from.slice(0, 4);
  const period =
    from === `${year}-01-01` && to === `${year}-12-31`
      ? year
      : `${formatDisplayDate(locale, from, 'short')}–${formatDisplayDate(locale, to, 'short')}`;
  const n = Math.max(1, Math.round((diffDays(to, from) + 1) / 7));
  return t(locale, n === 1 ? 'horizon.label.one' : 'horizon.label.other', { period, n });
}

export function formatNumber(locale: Locale, n: number, digits: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Euros without cents, in the locale's notation (1.234 € or €1,234). */
export function formatEuro(locale: Locale, n: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Percent of a fraction (0.5 -> 50%), by default without decimals, in the locale's notation. */
export function formatPercent(locale: Locale, fraction: number, maxDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  }).format(fraction);
}

export const locale = writable<Locale>(detectLocale());
/** The workspace's names for the two levels; App keeps it in step with settings and locale. */
export const levels = writable<LevelWords>(levelWords(undefined, detectLocale()));
/** The workspace's planning horizon as `formatHorizon` names it; App keeps it in step. */
export const horizonLabel = writable('');
/**
 * Store of a translate function; import as `translate as t` in components and use `$t(key)`.
 * Every text can use the level names as `{levelTeam}`, `{levelTeamsLc}` and so on, and the
 * planning horizon as `{planningHorizon}`, so every long-term cost names its period (#278).
 */
export const translate = derived([locale, levels, horizonLabel], ([$locale, $levels, $horizon]) => {
  const defaults = { ...levelParams($levels), planningHorizon: $horizon };
  return (key: string, params?: Params) => t($locale, key, params, defaults);
});
