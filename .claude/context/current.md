# Estado atual — Boate (Lótus Lounge)
> Retrato reescrito a cada /compress. Última atualização: 2026-11-15.

## Projeto
- Ambiente 3D jogável no navegador: boate (lounge) ligada por corredor e porta ao quarto da jacuzzi.
- Referências: duas imagens enviadas pelo Pedro (lounge neon e sala da jacuzzi). Nome provisório na tela: "Lótus Lounge".

## O que existe
- Jogo em three.js + Vite: primeira pessoa (WASD, mouse, Shift, E interage, G troca qualidade), toque básico.
- Cenário montado no Blender pelo MCP a partir de `blender/layout.json` (377 peças, 22 preenchimentos, 13 luzes).
- 100 dos 104 modelos da pasta "3D Assets" do Drive em uso (kit da boate + conjunto da jacuzzi).
- Porta com dobradiça entre corredor e jacuzzi; vão recortado na parede JAC_33.
- Efeitos: bloom, reflexo de piso molhado, cortina de fios com física, holograma e placas holográficas procedurais.
- Jacuzzi interativa: tecla E entra e sai (jogador sentado, olhos perto da água), água translúcida, vapor em fiapos.
- Shaders enxertados nos materiais do mapa todo: mármore, poças, veludo, neon, telas, bebidas, cortinas que reagem ao jogador.
- Carga otimizada: shaders compilados em paralelo, sala inicial primeiro e o resto em segundo plano, GLB em pré-carga.
- Qualidade: nível inicial pela placa de vídeo, guardado no navegador, com queda automática conferida.
- Build de produção em `dist/`: modelo 2,7 MB (~1 MB na rede com gzip) e JS 0,96 MB (0,25 MB com gzip).

## Ferramentas
- `npm run dev` (porta 5173), `npm run build`, `npm run planta` (gera layout.json), `npm run otimizar` (GLB bruto -> web).
- `npm run conferir` (peças atravessadas ou sem apoio na planta), `npm run publicar` (atualiza o link público).
- `catalogo.html` (só em dev): miniaturas das peças; `tools/*-glb.mjs`: inspeção de GLB.
- Repositório: `Creed-s-Fear/boate` no GitHub (público), ramo `main`. `blender/export/` e `dist/` ficam fora do `main`.
- Link para jogar: `https://creed-s-fear.github.io/boate/` (ramo `gh-pages` do mesmo repositório). Atualizar com `npm run publicar`.
- Sobram o arquivo privado do histórico antigo e o `lotus-lounge` (link antigo, parado).
- Blender 5.2 + MCP oficial; trava `blender_mcp_guard.py` liberada para `c:/boate/` em 2026-11-15 a pedido do Pedro.

## Em andamento
- Otimização para navegador e correção da cortina de fios (tremia com o jogador parado) prontas e testadas só na máquina local.
- Ainda sem commit e sem publicar: o link público está na versão anterior.

## Próximos 3 passos
1. Com o OK do Pedro: `npm run publicar` e commit da otimização e da correção da cortina.
2. Medir em placa integrada e em celular (o ajuste automático só foi testado com taxas simuladas).
3. Decidir se entram personagens (`Assets_Personagens.zip` ainda não baixado) e som ambiente.

## Riscos
- Cores de 5 materiais foram escolhidas pela referência (vieram brancos no GLB): Pedro precisa validar.
- Toque não foi testado em celular de verdade.
- Colisão de paredes e pisos agora é por caixa: conferida por caminhada automática, não por alguém jogando.

## Última sessão
- `sessions/2026-11-15-1810-cortina-parado.md` (antes: `1745-otimizacao-navegador`, `1715-repositorio-publico`, `1650-sofas`)
