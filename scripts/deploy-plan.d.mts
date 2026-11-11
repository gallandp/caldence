export interface DeployList {
  current: string[];
  kept: string[];
}
export const LIST_FILE: string;
export const PENDING_FILE: string;
export const KEPT_HEADER: string;
export const ENTRY_POINTS: string[];
export const PROTECTED: string[];
export function checkPath(path: string): string;
export function parseList(text: string): DeployList;
export function formatList(current: string[], kept: string[]): string;
export function plan(
  files: string[],
  old: DeployList | null,
): { batch: string[]; list: string; pending: string | null };
export function listFiles(dir: string): string[];
