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

## Jogo vindo do PeekHole (branch peekhole-gameplay, 2026-11-16)
- 2026-11-16 — Regras do PeekHole adaptadas às 3 salas do boate, sem mexer no GLB: terminal da entrada = recepção/caixa/armário, corredor guardado pelo segurança, jacuzzi = Suíte Jacuzzi reservável — pedido do usuário; expandir o mapa ficou para depois.
- 2026-11-16 — O Player do boate continua dono de movimento, colisão 3D, olhar e jacuzzi; o jogo (src/game/game.ts) só lê/aciona o motor por interfaces (BoateWorld, BoatePlayer) — física e degraus do boate são melhores que a colisão 2D do PeekHole.
- 2026-11-16 — Código do jogo em TypeScript (src/game, src/ui) convivendo com o JS do motor (allowJs, checkJs desligado) — portado do PeekHole sem reescrever; npm run build agora roda tsc antes.
- 2026-11-16 — 3ª pessoa (tecla V) por cima do Player: câmera recua atrás do ombro com raio contra a BVH (ViewCam) — o pedido incluía 1ª e 3ª pessoa.
- 2026-11-16 — Qualidade passou de G para Q; G é dançar (padrão do PeekHole).
- 2026-11-16 — NPCs desviam de caixas 2D lidas das peças do GLB antes da junção de malhas (obstacles.ts) + contorno das salas (venue.ts) — BVH por NPC seria caro e desnecessário.
- 2026-11-16 — Personagens: partes juntadas por grupo animado com cor por vértice (5 malhas por boneco, material único) e na camada 1 (fora do reflexo) — 21 NPCs custavam 558 draw calls e +4,3 ms; agora 180 e +3,1 ms.
- 2026-11-16 — CSP no index.html com 'wasm-unsafe-eval' (só compilação de WebAssembly, para o decodificador meshopt) — sem ele o GLB não abre.
- 2026-11-16 — Tecla E: pessoa à frente ganha da porta quando as duas estão ao alcance — a anfitriã espera ao lado da porta da suíte e o boate aceita a porta até de costas a menos de 1,1 m.
- 2026-11-16 — Câmeras das cenas orientadas para dentro do cômodo (da anfitriã para o centro), não mais em +Z fixo — na suíte, +Z caía no corredor.
- 2026-11-16 — Conteúdo continua não explícito (anfitriãs adultas, dança, conversa, champagne).
- 2026-11-16 — O boate é o único projeto ativo; o PeekHole (Projects/PeekHole) foi descontinuado pelo usuário e fica só como referência das regras portadas.
- 2026-11-16 — Agachar na tecla C (alterna): cápsula 1,74 → 1,12 m, olhos 1,0 m, passo lento sem corrida; só levanta se a cápsula em pé couber — Ctrl foi descartado porque Ctrl+W fecha a aba.
- 2026-11-16 — Pagamento usa a carteira e completa com o banco (cartão) — o jogador começa com $200 e o VIP custa $300; obrigar a passar no caixa travava a compra.
- 2026-11-16 — Terminal com no máximo 7 itens (anfitriãs num submenu) — teclas 1–9 alcançam tudo.

## Contas e depósito em SOL (server/, 2026-11-16)
- 2026-11-16 — Visitante segue com dinheiro de mentira no navegador; conta (usuário + senha) tem saldo em fichas no servidor, comprado com SOL — pedido do usuário: "uma carteira por login pra depositar solanas e gastar no jogo".
- 2026-11-16 — Servidor Fastify + Postgres (Docker, 127.0.0.1:5433) em `server/`, pacote separado; Vite faz proxy de /api (mesma origem, cookie SameSite=Strict) — saldo com dinheiro real não pode morar no localStorage.
- 2026-11-16 — Um endereço de depósito por conta, derivado (SLIP-0010, m/44'/501'/id'/0') de uma semente mestre só no .env; o banco guarda só o endereço — nenhuma chave privada no banco; a semente controla os fundos (backup fora do repo).
- 2026-11-16 — Depósito só é creditado lido como `finalized`, uma vez por assinatura (PK em deposits); varredura só de endereços "observados" (carteira aberta nas últimas 2 h) — custo de RPC cresce com quem deposita, não com o total de contas.
- 2026-11-16 — Compra cobrada pelo id do item com a tabela única `src/game/catalog.ts`; UPDATE atômico com `balance >= preço` + requestId único no ledger (idempotente) — teste: 20 compras paralelas não deixam saldo negativo; mesmo requestId cobra 1 vez.
- 2026-11-16 — Fichas não são sacáveis (só entram) — saque viraria câmbio/cassino, com outra carga regulatória.
- 2026-11-16 — Começa na devnet; mainnet exige ALLOW_MAINNET=1 — trava contra dinheiro real por engano. Antes da mainnet: hospedagem, verificação de idade de verdade e jurídico.
- 2026-11-16 — Falas das anfitriãs não mencionam depósito/SOL; depósito só pela Carteira Solana no terminal — limite combinado: personagem não empurra dinheiro real.

## Personagens com esqueleto (2026-11-16)
- 2026-11-16 — Fontes (Cyber A–D, Tropical, Bartender v6, ~135 MB) em `assets/personagens/fonte/` (fora do git); `npm run personagens` gera `public/models/personagens/` (~8,4 MB) — fonte pesada não vai para o repositório.
- 2026-11-16 — Cyber A–D vieram sem esqueleto: herdam esqueleto da Tropical por vizinhança (corpos alinhados a ~2 cm), com braços da referência ajustados por modelo e triângulos mão↔quadril cortados — malhas de IA vêm com a mão grudada no quadril.
- 2026-11-16 — Malhas 590 mil → 30 mil triângulos; texturas WebP 2048 (bartender: cor 2048, resto 1024) — 4096 em todas passava de 600 MB de VRAM.
- 2026-11-16 — Animações da Tropical vieram vazias (57 canais parados): andar/parada/dança são procedurais nos ossos (skinnedCharacter.ts), na mesma API do Character — mesma lógica dos bonecos low-poly.
- 2026-11-16 — Valentina=Cyber D, Yasmin=Cyber C, Bianca=Cyber B (não ergue os braços: mão fundida), Luna=Cyber A, Nyx=Tropical; bar = Bartender v6, renomeada Carla (era Caio).
- 2026-11-16 — Modelos baixam depois que o jogo abre; até lá ficam os low-poly — a entrada não espera 8 MB.
- 2026-11-16 — CSP ganhou `blob:` em connect-src — o GLTFLoader lê texturas embutidas por URL blob; sem isso os modelos ficavam sem textura.
- 2026-11-16 — Correções dos modelos: mão inteira da Cyber B herdava peso de coxa (pedaço solto após o corte → volta para a mão); buracos do corte fechados com a própria borda; cabelo no ombro (acima e para dentro da junta) não segue o braço; raio do braço continua largo (justo soltava a pele interna).
- 2026-11-16 — Animação procedural com pé no chão: altura do corpo sai do pé mais baixo a cada quadro; pé compensa coxa+canela; passada 5,6 rad/s casada com 1,25 m/s — pé apontava para baixo, afundava na dança e patinava.
- 2026-11-16 — `/tools/personagens.html` (só no dev) mostra os 5 modelos com luz neutra e pose congelada (`__at(pose, t, yaw, zoom, alvo)`; `?fonte=` põe o original ao lado).
