/**
 * A file-name-safe form of `text`: lowercase ASCII words joined by '-', at most 64 characters (so it
 * is also a valid id), or 'caldence' if none remain.
 */
export function slug(text: string): string {
  const out = text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return out === '' ? 'caldence' : out;
}
