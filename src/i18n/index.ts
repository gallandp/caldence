import { derived, writable } from 'svelte/store';
import type { ISODate } from '../core/date';
import type { Settings } from '../core/model';
import de from './de.json';
import en from './en.json';

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

export function t(locale: Locale, key: string, params?: Params): string {
  const text = catalogues[locale][key];
  if (text === undefined) return key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params && name in params ? String(params[name]) : whole,
  );
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
    maximumFractionDigits: 0,
  }).format(n);
}

/** Percent of a fraction (0.5 -> 50%) without decimals, in the locale's notation. */
export function formatPercent(locale: Locale, fraction: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(fraction);
}

export const locale = writable<Locale>(detectLocale());
/** Store of a translate function; import as `translate as t` in components and use `$t(key)`. */
export const translate = derived(
  locale,
  ($locale) => (key: string, params?: Params) => t($locale, key, params),
);
