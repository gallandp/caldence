import { LIMITS } from '../core/limits';

/**
 * An hourly rate typed in German or English: digits with an optional decimal comma or point and
 * up to two decimals ("85", "85,50", "85.5"). Thousands separators, signs, exponents and hex are
 * refused, so "1.000" is never read as 1 €. Null for anything else or out of range.
 */
export function parseRate(text: string): number | null {
  const plain = text.replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(plain)) return null;
  const n = Number(plain.replace(',', '.'));
  return n > 0 && n <= LIMITS.hourlyRate ? n : null;
}
