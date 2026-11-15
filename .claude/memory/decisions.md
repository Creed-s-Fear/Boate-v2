# Decisões vigentes
> `AAAA-MM-DD — decisão — porquê`. Substituída vai para `arquivo/decisoes-substituidas.md`.

## Montagem
- 2026-11-15 — A planta vive em `blender/layout.json`, gerada por `tools/make-layout.mjs` — uma fonte só para Blender e conferência.
- 2026-11-15 — Montagem no Blender só pelo MCP, com duplicatas ligadas das peças da coleção PECAS — pedido do Pedro; GLB sai com instâncias.
- 2026-11-15 — Lounge com paredes do kit e teto mais alto, com faixa escura de preenchimento — a cabine de cortina não cabe sob o teto do kit.
- 2026-11-15 — Sala da jacuzzi girada para a parede da porta (JAC_33) encostar no fim do corredor — "uma porta leva ao quarto".
- 2026-11-15 — Vão da porta recortado só nas cascas fechadas da parede; porta JAC_38 separada, com dobradiça — booleano na parede inteira falha.
- 2026-11-15 — Entrada da jacuzzi fica livre de móveis; espreguiçadeiras foram para o centro e a direita — bloqueavam a porta.
- 2026-11-15 — 5 materiais que vieram brancos receberam tons escuros da referência dentro do Blender — textura procedural não exporta.

## Jogo
- 2026-11-15 — three.js + Vite, sem framework — leve e direto para um ambiente navegável.
- 2026-11-15 — Regras por NOME de peça e de material (`src/level/kit.js`): colisão, brilho, piso molhado, água — Blender não precisa de marcações.
- 2026-11-15 — Malhas estáticas são unidas por material e por sala ao carregar — centenas de peças viram cerca de cem draw calls.
- 2026-11-15 — Sala só é desenhada se o jogador está nela ou se a porta está aberta — metade do custo com a porta fechada.
- 2026-11-15 — Materiais viram MeshStandard/MeshBasic (sem clearcoat e sheen) e neon tem brilho reduzido — shader leve e bloom sem estourar.
- 2026-11-15 — Sem sombras em tempo real; luz vem de poucas luzes pontuais, emissivos, bloom e mapa de ambiente por sala — custo baixo.
- 2026-11-15 — GLB otimizado fora do Blender (simplificação + meshopt); anel, plataforma e banheira não são simplificados — a curva brilhante denuncia.
- 2026-11-15 — Cortina de fios: um pêndulo por fio simulado em JS, deslocamento no shader por textura — física real com 1 draw call.
- 2026-11-15 — Holograma refeito em shader (lótus, anéis, faixas, partículas); só a base da peça original fica — a peça era lisa demais.
- 2026-11-15 — Banheira atravessável com degraus invisíveis e passo lento na água — Pedro quis entrar na jacuzzi.
- 2026-11-15 — Fio encostado no corpo perde só a velocidade de entrada, escorrega com atrito e contorna o corpo — parado, tremia e ficava preso.

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

## Desempenho
- 2026-11-15 — Shaders são pedidos todos na carga e compilados em paralelo pelo navegador — compilar no primeiro desenho travava a página.
- 2026-11-15 — Antes do botão "Entrar" só a sala inicial fica pronta; o resto termina em segundo plano — o jogador leva segundos até a porta.
- 2026-11-15 — Paredes inteiras, pisos e colunas colidem como caixas; triângulos só onde há vão ou degrau — mesma colisão, bem menos triângulos.
- 2026-11-15 — O endereço do GLB é resolvido no build e vai no index.html como pré-carga, com resumo do conteúdo — baixa junto e não pega cache velho.
- 2026-11-15 — Qualidade inicial pela placa de vídeo e guardada no navegador; a tecla G continua mandando — cada visitante começa num nível que roda.
- 2026-11-15 — Redução automática de resolução ou nível só vale se a taxa de quadros melhorar; senão é desfeita — taxa travada por fora rebaixava à toa.
- 2026-11-15 — Com o menu na frente o jogo desenha poucas vezes por segundo — a cena fica desfocada atrás do cartão e a placa descansa.

## Processo
- 2026-11-15 — Trava do Blender MCP passou a aceitar `c:/boate/` (e protege `c:/boate/.git`), editada a pedido do Pedro — projeto novo.
- 2026-11-15 — Memória do projeto no mesmo esquema do Underclock, com `/retomar-boate` e `/salvar-boate` — padrão do Pedro.
- 2026-11-15 — Código no GitHub em `Creed-s-Fear/boate`, público desde a tarde de 15/11 — Pedro pediu "tudo público".
- 2026-11-15 — Jogável no ramo `gh-pages` do próprio `boate`, servido pelo GitHub Pages — Pedro quis o jogável no mesmo repositório.
- 2026-11-15 — Todo commit deste projeto usa o e-mail noreply do GitHub (configuração local do repositório) — o pessoal não pode aparecer.
- 2026-11-15 — Repositório aberto como novo, com histórico regravado; o privado antigo virou arquivo — sobrescrever deixaria commits antigos alcançáveis.
- 2026-11-15 — `boate` é o único repositório do projeto; o arquivo do histórico antigo e o `lotus-lounge` são para apagar — Pedro: "é o único que importa".
- 2026-11-15 — `blender/export/` (GLB bruto) fora do git; o GLB otimizado e o .blend vão — o jogo roda só com o clone, o bruto se regenera.
