/** A file-name-safe form of `text`: lowercase ASCII words joined by '-', or 'caldence' if none remain. */
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
    .replace(/^-+|-+$/g, '');
  return out === '' ? 'caldence' : out;
}
