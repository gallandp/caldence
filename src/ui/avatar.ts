import { contrastRatio } from '../core/colour';

/** Up to two initials, one per word; whole characters, so an emoji or a rare CJK sign stays intact. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toUpperCase())
    .join('');
}

/** Dark or white text on `colour`, whichever reads better. */
export function inkOn(colour: string): string {
  return contrastRatio(colour, '#ffffff') >= contrastRatio(colour, '#0f1426')
    ? '#ffffff'
    : '#0f1426';
}
