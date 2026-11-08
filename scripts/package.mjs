// Packs the contents of dist/ (without a dist/ prefix) into caldence-<version>.zip in the repo root.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('dist/ is missing or empty. Run "npm run build" first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const name = `caldence-${version}.zip`;
const target = resolve(root, name);
rmSync(target, { force: true });
// "." includes dotfiles such as .htaccess.
execFileSync('zip', ['-r', '-q', target, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`Created ${name}`);
