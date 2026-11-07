export type ReleaseLabel =
  'release:major' | 'release:minor' | 'release:hotfix' | 'release:none' | null;
export function bump(version: string, label: ReleaseLabel): string;
export function releaseChangelog(
  changelog: string,
  version: string,
  date: string,
): { changelog: string; notes: string };
