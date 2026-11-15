# Estado atual — Boate (Lótus Lounge)
> Retrato reescrito a cada /compress. Última atualização: 2026-11-15.

## Projeto
- Ambiente 3D jogável no navegador: boate (lounge) ligada por corredor e porta ao quarto da jacuzzi.
- Referências: duas imagens enviadas pelo Pedro (lounge neon e sala da jacuzzi). Nome provisório na tela: "Lótus Lounge".

## O que existe
- Jogo em three.js + Vite: primeira pessoa (WASD, mouse, Shift, E abre porta, G troca qualidade), toque básico.
- Cenário montado no Blender pelo MCP a partir de `blender/layout.json` (382 peças, 22 preenchimentos, 13 luzes).
- 100 dos 104 modelos da pasta "3D Assets" do Drive em uso (kit da boate + conjunto da jacuzzi).
- Porta com dobradiça entre corredor e jacuzzi; vão recortado na parede JAC_33.
- Efeitos: bloom, reflexo de piso molhado, cortina de fios com física, holograma procedural (lótus).
- Jacuzzi interativa: tecla E entra e sai (jogador sentado, olhos perto da água), água translúcida com espuma dos jatos, vapor em fiapos.
- Shaders enxertados nos materiais do mapa todo: veios no mármore, poças, veludo, neon, telas, cortinas de tecido que reagem ao jogador.
- Build de produção em `dist/`: cerca de 4 MB (modelo 2,6 MB; JS 0,9 MB).

## Ferramentas
- `npm run dev` (porta 5173), `npm run build`, `npm run planta` (gera layout.json), `npm run otimizar` (GLB bruto -> web).
- `catalogo.html` (só em dev): miniaturas das peças; `tools/*-glb.mjs`: inspeção de GLB.
- Repositório: `Creed-s-Fear/boate` no GitHub (privado), ramo `main`. `blender/export/` e `dist/` ficam fora do git.
- Blender 5.2 + MCP oficial; trava `blender_mcp_guard.py` liberada para `c:/boate/` em 2026-11-15 a pedido do Pedro.

## Em andamento
- Pedro está testando o jogo no painel do navegador e dando retorno ao vivo.

## Próximos 3 passos
1. Ouvir o retorno do Pedro sobre a jacuzzi nova (tecla E, água, vapor) e os shaders do mapa.
2. Decidir se entram personagens (`Assets_Personagens.zip` ainda não baixado).
3. Ajuste fino de luz e composição comparando com as duas imagens de referência.

## Riscos
- Cores de 5 materiais foram escolhidas pela referência (vieram brancos no GLB): Pedro precisa validar.
- Toque não foi testado em celular de verdade.

## Última sessão
- `sessions/2026-11-15-1525-github.md` (antes: `1455-jacuzzi-e-shaders`, `1330-base-e-montagem`)
