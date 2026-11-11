export const LIST_FILE: string;
export const ENTRY_POINTS: string[];
export const PROTECTED: string[];
export function checkPath(path: string): string;
export function parseList(text: string): string[];
export function plan(files: string[], oldFiles: string[] | null): string[];
export function listFiles(dir: string): string[];
