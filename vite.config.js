import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Reads public/models/level.json ({ "glb": "boate.glb" }) and returns the model URL with
// a content digest (?v=...). Without the manifest or the file, returns null and the game
// uses the provisional scene.
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

// Injects the model preload into index.html: the browser downloads the GLB in parallel
// with the code, and the game reads the URL from that same link (src/level/loadLevel.js).
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
  // The API (server/) runs separately; the proxy keeps game and API on the same origin (cookie SameSite=Strict).
  server: { port: 5173, strictPort: true, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
