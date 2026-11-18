# Decisões movidas de `memory/decisions.md` em 2026-11-17 (sem edição; continuam valendo)

## Montagem
- 2026-11-15 — A planta vive em `blender/layout.json`, gerada por `tools/make-layout.mjs` — uma fonte só para Blender e conferência.
- 2026-11-15 — Montagem no Blender só pelo MCP, com duplicatas ligadas das peças da coleção PECAS — pedido do Pedro; GLB sai com instâncias.
- 2026-11-15 — Lounge com paredes do kit e teto mais alto, com faixa escura de preenchimento — a cabine de cortina não cabe sob o teto do kit.
- 2026-11-15 — Sala da jacuzzi girada para a parede da porta (JAC_33) encostar no fim do corredor — "uma porta leva ao quarto".
- 2026-11-15 — Vão da porta recortado só nas cascas fechadas da parede; porta JAC_38 separada, com dobradiça — booleano na parede inteira falha.
- 2026-11-15 — Entrada da jacuzzi fica livre de móveis; espreguiçadeiras foram para o centro e a direita — bloqueavam a porta.
- 2026-11-15 — 5 materiais que vieram brancos receberam tons escuros da referência dentro do Blender — textura procedural não exporta.

## Jacuzzi e shaders
- 2026-11-15 — Tecla E é contextual (sair da jacuzzi > porta > entrar na jacuzzi) — pedido do Pedro: uma tecla só para interagir.
- 2026-11-15 — Na jacuzzi o jogador fica "sentado": posição e altura dos olhos animadas, movimento travado, olhar livre — dá a sensação de imersão.
- 2026-11-15 — Água é um disco próprio com shader translúcido; a malha de água e a espuma da peça são retiradas ao carregar — a original era lisa.
- 2026-11-15 — Vapor e água animam só no shader (nenhum cálculo por quadro em JS) — custo fixo e baixo.
- 2026-11-15 — Detalhe do mapa vem de trechos de shader enxertados nos materiais existentes (`shaderFx.js`), sem objetos novos — "sem pesar".
- 2026-11-15 — Cortinas de tecido reagem ao jogador no vértice do shader; só a de fios tem simulação por fio — custo proporcional ao efeito.
- 2026-11-15 — Simplificação do GLB só em lista explícita de peças densas e orgânicas — simplificar tudo apagou treliças finas.

## Correções e detalhe
- 2026-11-15 — Toda mudança de planta passa por `npm run conferir` antes de ir ao Blender — peças atravessadas escaparam no olho.
- 2026-11-15 — Aviso da jacuzzi exige estar perto da borda e de frente para ela — aparecia junto dos móveis e de costas.
- 2026-11-15 — Placas holográficas da parede usam um quad com paralaxe em camadas, mais flor 3D na do lótus — mesmo nível do projetor.
- 2026-11-15 — Picos de brilho são comprimidos antes do bloom (joelho 1,7) e superfícies lisas têm rugosidade mínima 0,1 — ofuscava.
