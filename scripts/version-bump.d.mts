export type ReleaseLabel =
  'release:major' | 'release:minor' | 'release:hotfix' | 'release:none' | null;
export function bump(version: string, label: ReleaseLabel): string;
export function releaseChangelog(
  changelog: string,
  version: string,
  date: string,
  fallback?: string,
): { changelog: string; notes: string };
export function highestLabel(labels: string[]): string;
export function escapeRegExp(s: string): string;
export function versionNotes(changelog: string, version: string): string;
