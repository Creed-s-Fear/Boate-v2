// Publica o build atual no link público do jogo (GitHub Pages).
// O repositório público guarda SÓ o jogo compilado; o código, os modelos originais,
// o .blend e a memória ficam no repositório privado.
//
// Uso: npm run publicar   (precisa do gh autenticado)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'Creed-s-Fear/lotus-lounge';
const URL = 'https://creed-s-fear.github.io/lotus-lounge/';
const run = (cmd, cwd = process.cwd()) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

console.log('gerando o build...');
run('npm run build');

const dir = mkdtempSync(join(tmpdir(), 'lotus-pages-'));
run(`gh repo clone ${REPO} "${dir}" -- --depth 1`);
for (const name of readdirSync(dir)) {
  if (name !== '.git') rmSync(join(dir, name), { recursive: true, force: true });
}
cpSync('dist', dir, { recursive: true });
writeFileSync(join(dir, '.nojekyll'), '');
run('git add -A', dir);

if (!run('git status --porcelain', dir)) {
  console.log('nada mudou desde a última publicação.');
} else {
  // e-mail "noreply" do GitHub: o repositório é público e o e-mail pessoal não deve aparecer nele
  const login = run('gh api user --jq .login');
  const id = run('gh api user --jq .id');
  run(`git -c user.name=${login} -c user.email=${id}+${login}@users.noreply.github.com commit -m "Atualiza a versao jogavel"`, dir);
  run('git push origin main', dir);
  console.log(`publicado: ${URL} (o GitHub leva cerca de 1 minuto para atualizar)`);
}
rmSync(dir, { recursive: true, force: true });
