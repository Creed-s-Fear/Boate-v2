# Lótus Lounge

Ambiente 3D jogável no navegador: uma boate ligada por um corredor de neon e uma porta à sala da jacuzzi.
Feito com three.js + Vite; o cenário é montado no Blender a partir das peças em `assets/drive`.

**Jogar no navegador:** https://creed-s-fear.github.io/boate/

O jogo compilado fica no ramo `gh-pages` deste repositório; `npm run publicar` gera o build e atualiza esse ramo.

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Para gerar a versão de produção: `npm run build` (sai em `dist/`).

## Controles

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Mouse | olhar |
| Shift | correr |
| E | interagir (abrir porta, entrar e sair da jacuzzi) |
| G | trocar a qualidade (baixa, média, alta) |

`?stats` na URL mostra fps, draw calls e triângulos.

## Como o cenário é feito

1. `npm run planta` — `tools/make-layout.mjs` gera `blender/layout.json` (posição de cada peça).
2. No Blender, `blender/scripts/2_montar_e_exportar.py` monta a cena e exporta o GLB bruto para `blender/export/`.
3. `npm run otimizar` — simplifica e comprime o GLB para `public/models/boate.glb`, que é o que o jogo carrega.

Detalhes de pastas e convenções em `.claude/memory/architecture.md`.
