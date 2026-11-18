// Publica o build atual no link do jogo (GitHub Pages).
// O jogo compilado fica no ramo `gh-pages` deste mesmo repositório; o GitHub Pages serve
// esse ramo. O ramo `main` continua só com o código-fonte.
//
// Uso: npm run publicar   (precisa do git com acesso ao repositório)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'https://github.com/Creed-s-Fear/boate.git';
const BRANCH = 'gh-pages';
const URL = 'https://creed-s-fear.github.io/boate/';
const run = (cmd, cwd = process.cwd()) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

console.log('gerando o build...');
run('npm run build');

const dir = mkdtempSync(join(tmpdir(), 'joh-pages-'));
try {
  run(`git clone --depth 1 --branch ${BRANCH} ${REPO} "${dir}"`);
} catch {
  // primeira publicação: o ramo ainda não existe
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
  console.log('nada mudou desde a última publicação.');
} else {
  // mesmo autor do repositório (e-mail "noreply" do GitHub, para o pessoal não aparecer)
  const name = run('git config user.name');
  const email = run('git config user.email');
  run(`git -c user.name="${name}" -c user.email="${email}" commit -m "Atualiza a versao jogavel"`, dir);
  run(`git push origin HEAD:${BRANCH}`, dir);
  console.log(`publicado: ${URL} (o GitHub leva cerca de 1 minuto para atualizar)`);
}
rmSync(dir, { recursive: true, force: true });
