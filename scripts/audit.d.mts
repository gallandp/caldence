export const ACCEPTED: Record<string, string>;
export function inRange(version: string, range: string): boolean | null;
export function evaluate(
  report: { vulnerabilities?: Record<string, { via: (string | Advisory)[] }> },
  latest: Record<string, string>,
  accepted?: Record<string, string>,
): { failures: string[]; ignored: string[] };

interface Advisory {
  name: string;
  title: string;
  url: string;
  severity: string;
  range: string;
}
