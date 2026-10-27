// Builds the site into website/dist: the static pages, plus a live demo — the fixture app's map,
// drawn by the CLI built from this commit, so the demo always matches the code.
// Run `npm run build` first; `npm run build:website` does both.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const site = fileURLToPath(new URL('.', import.meta.url));
const out = fileURLToPath(new URL('./dist/', import.meta.url));
const { version } = JSON.parse(readFileSync(`${repo}package.json`, 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(`${site}style.css`, `${out}style.css`);
cpSync(`${site}favicon.svg`, `${out}favicon.svg`);
writeFileSync(`${out}index.html`, readFileSync(`${site}index.html`, 'utf8').replaceAll('{{version}}', version));

// Run from the repo root so the map's project root reads "test/fixtures", not an absolute path.
execFileSync(process.execPath, ['dist/cli/index.js', '-p', 'test/fixtures/tsconfig.json', '-q', '-o', `${out}demo.html`], {
  cwd: repo,
  stdio: 'inherit',
});
process.stderr.write(`website built in ${out}\n`);
