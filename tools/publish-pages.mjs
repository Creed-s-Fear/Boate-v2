// Publishes the current build to the game link (GitHub Pages).
// The compiled game lives on the `gh-pages` branch of this same repository; GitHub Pages
// serves that branch. The `main` branch stays source-only.
//
// Usage: npm run publicar   (requires git with repository access)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'https://github.com/Creed-s-Fear/boate.git';
const BRANCH = 'gh-pages';
const URL = 'https://creed-s-fear.github.io/boate/';
const run = (cmd, cwd = process.cwd()) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

console.log('generating the build...');
run('npm run build');

const dir = mkdtempSync(join(tmpdir(), 'joh-pages-'));
try {
  run(`git clone --depth 1 --branch ${BRANCH} ${REPO} "${dir}"`);
} catch {
  // first publish: branch doesn't exist yet
  run(`git init -b ${BRANCH} "${dir}"`);
  run(`git remote add origin ${REPO}`, dir);
}
for (const name of readdirSync(dir)) {
  if (name !== '.git') rmSync(join(dir, name), { recursive: true, force: true });
}
cpSync('dist', dir, { recursive: true });
writeFileSync(join(dir, '.nojekyll'), '');
run('git add -A', dir);

if (!run('git status --porcelain', dir)) {
  console.log('nothing changed since last publish.');
} else {
  // same repo author (GitHub noreply email, so personal emails don't show)
  const name = run('git config user.name');
  const email = run('git config user.email');
  run(`git -c user.name="${name}" -c user.email="${email}" commit -m "Update playable version"`, dir);
  run(`git push origin HEAD:${BRANCH}`, dir);
  console.log(`published: ${URL} (GitHub takes about 1 minute to update)`);
}
rmSync(dir, { recursive: true, force: true });
