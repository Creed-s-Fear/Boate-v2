import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Lê public/models/level.json ({ "glb": "boate.glb" }) e devolve o endereço do modelo com
// um resumo do conteúdo (?v=...). Sem manifesto ou sem o arquivo, devolve null e o jogo
// usa o cenário provisório.
function levelUrl() {
  try {
    const { glb } = JSON.parse(readFileSync('public/models/level.json', 'utf8'));
    const file = 'public/models/' + glb;
    if (!glb || !existsSync(file)) return null;
    const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 10);
    return `./models/${glb}?v=${hash}`;
  } catch {
    return null;
  }
}

// Põe no index.html o pedido antecipado do modelo: o navegador baixa o GLB em paralelo
// com o código, e o jogo lê o endereço desse mesmo link (src/level/loadLevel.js).
const levelPreload = {
  name: 'boate-level-preload',
  transformIndexHtml(html, ctx) {
    const url = /(^|[\\/])index\.html$/.test(ctx.filename) ? levelUrl() : null;
    if (!url) return html;
    return {
      html,
      tags: [
        {
          tag: 'link',
          attrs: { id: 'level', rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: url },
          injectTo: 'head',
        },
      ],
    };
  },
};

export default defineConfig({
  base: './',
  plugins: [levelPreload],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
