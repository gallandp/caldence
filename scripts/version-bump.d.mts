export type ReleaseLabel =
  'release:major' | 'release:minor' | 'release:hotfix' | 'release:none' | null;
export function bump(version: string, label: ReleaseLabel): string;
export function releaseChangelog(
  changelog: string,
  version: string,
  date: string,
  changes?: string,
): { changelog: string; notes: string };
export function highestLabel(labels: string[]): string;
export function escapeRegExp(s: string): string;
export function versionNotes(changelog: string, version: string): string;
export function mergeSections(...markdowns: string[]): string;
export function changelogSection(body: string | null | undefined): string;
export function prChanges(
  prs: {
    number: number;
    title: string;
    body?: string | null;
    author?: string;
    association?: string;
    editedChangelog?: boolean;
  }[],
): string;
export function cleanEntry(text: string): string;
