// `npm audit` with a short list of accepted advisories. Fails on every other high or
// critical advisory, and on an accepted one once the package has a patched release.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each entry: why it is accepted and when to remove it.
export const ACCEPTED = {
  // https://github.com/advisories/GHSA-fc5q-39xc-vjpf
  // picomatch ReDoS via extglobs, every version affected, no patch yet. Only build and
  // test tooling (vite, vitest, svelte-check, workbox) uses it, on our own glob patterns,
  // so attacker input never reaches it. Remove once picomatch ships a fix.
  'GHSA-fc5q-39xc-vjpf': 'picomatch',
};

const BLOCKING = new Set(['high', 'critical']);

/** Compares two x.y.z versions; prerelease tags are ignored. */
function compare(a, b) {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** True when `version` lies in an advisory range like "<=4.0.7" or "<4.1.0". Null if unknown. */
export function inRange(version, range) {
  const m = /^\s*(<=?)\s*(\d+\.\d+\.\d+)\s*$/.exec(range);
  if (!m) return null;
  const c = compare(version, m[2]);
  return m[1] === '<=' ? c <= 0 : c < 0;
}

/**
 * Splits the advisories of an `npm audit --json` report.
 * `latest` maps a package name to its newest published version.
 */
export function evaluate(report, latest, accepted = ACCEPTED) {
  const failures = [];
  const ignored = [];
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
      const id = via.url.split('/').pop();
      const line = `${via.name}: ${via.title} (${via.url}, ${via.range})`;
      if (accepted[id] !== via.name) {
        failures.push(line);
      } else if (inRange(latest[via.name], via.range) !== true) {
        failures.push(
          `${line}: a patched ${via.name} ${latest[via.name]} exists. Update it and remove ` +
            `${id} from ACCEPTED in scripts/audit.mjs.`,
        );
      } else {
        ignored.push(line);
      }
    }
  }
  return { failures, ignored };
}

function main() {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8' });
  } catch (e) {
    // npm audit exits non-zero when it finds anything; the report is still on stdout.
    out = e.stdout;
  }
  const report = JSON.parse(out);
  if (report.error)
    throw new Error(`npm audit failed: ${report.message ?? JSON.stringify(report.error)}`);
  const latest = {};
  for (const name of new Set(Object.values(ACCEPTED))) {
    latest[name] = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8' }).trim();
  }
  const { failures, ignored } = evaluate(report, latest);
  for (const line of ignored) console.log(`accepted: ${line}`);
  for (const line of failures) console.error(`::error::${line}`);
  if (failures.length) process.exit(1);
  console.log('No unaccepted high or critical advisories.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
