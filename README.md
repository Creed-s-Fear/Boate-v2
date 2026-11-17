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
| E | interagir (terminal, bar, anfitriãs, sentar/levantar, porta, jacuzzi) |
| V | alternar 1ª / 3ª pessoa (roda do mouse = zoom) |
| C | agachar / levantar |
| G | dançar |
| Q | trocar a qualidade (baixa, média, alta) |
| H / M | ajuda · som |

`?stats` na URL mostra fps, draw calls e triângulos.

## Jogo (regras vindas do PeekHole)

Terminal da entrada (Lívia): pulseira de consumo, passe VIP, reserva da Suíte Jacuzzi, caixa
eletrônico e armário (roupa). A pulseira libera o bar e as anfitriãs; o segurança (Bruno) só
deixa passar pelo corredor quem tem VIP ou a suíte reservada. Anfitriãs (todas adultas, conteúdo
não explícito) ganham interesse com conversa, drinks, gorjeta e dança; com ♥ 3/5 aceitam o
convite para a suíte, onde há cenas (dança privada, champagne, conversa). Dançar na pista enche a
vibe; bebidas sobem o buzz. Dinheiro, nome, roupa e VIP ficam salvos no navegador.

Código do jogo em `src/game/` (TypeScript: regras, NPCs, personagens, cenas, câmera 3ª pessoa)
e `src/ui/` (HUD, menu, minimapa, verificação de idade). Pontos de interação, assentos e rotas
ficam em `src/game/venue.ts`. `npm run typecheck` confere os tipos.

## Como o cenário é feito

1. `npm run planta` — `tools/make-layout.mjs` gera `blender/layout.json` (posição de cada peça).
2. No Blender, `blender/scripts/2_montar_e_exportar.py` monta a cena e exporta o GLB bruto para `blender/export/`.
3. `npm run otimizar` — simplifica e comprime o GLB para `public/models/boate.glb`, que é o que o jogo carrega.

Detalhes de pastas e convenções em `.claude/memory/architecture.md`.
