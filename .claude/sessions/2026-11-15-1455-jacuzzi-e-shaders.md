# 2026-11-15 14:55 — Jacuzzi interativa e shaders no mapa todo

## Feito
- Tecla E agora decide pelo contexto: sair da jacuzzi, abrir/fechar porta ou entrar na jacuzzi (aviso na tela muda junto).
- Jacuzzi: transição suave por cima da borda, jogador sentado com os olhos perto da água, olhar livre, E de novo para sair.
- Profundidade: fundo de colisão mais baixo (degraus invisíveis até 15 cm do piso) e câmera mais baixa ao andar dentro da água.
- Água refeita: translúcida, cáusticas deslocadas pela refração (parecem no fundo), luz vinda de baixo, espuma fina dos 6 jatos,
  ondas e espuma em volta do jogador, reflexo discreto do anel. A malha de água e a espuma modeladas da peça saem em tempo de carga.
- Vapor refeito: fiapos de névoa virados para a câmera (forma por ruído) e lençol de névoa rente à água; animação toda no shader.
- Shaders no mapa todo (`src/level/shaderFx.js`), enxertados nos materiais existentes, sem novos draw calls: veios no mármore,
  poças no piso, brilho de borda no veludo, miolo quente no neon, varredura nas placas holográficas, dados nas telas,
  respiração nas luzes de fundo e cortinas de tecido que balançam e se abrem em volta do jogador.
- Otimização do GLB passou a simplificar só peças densas e orgânicas (lista explícita): 2,64 MB, 78% dos triângulos.
- Planta: os 2 painéis treliçados avulsos saíram da entrada da jacuzzi e foram para a parede da alcova da cama.
- Exportação pelo MCP agora silencia o log do exportador (`logging.disable`), retorno curto.

## Decidido
- Ver `memory/decisions.md` (bloco "Jacuzzi e shaders").

## Resolvido
- Validação pedida ao Pedro sobre cortina, holograma e entrada na jacuzzi: ele aprovou ("ótimo") e pediu esta rodada.
- Espuma em manchas brancas grandes e água arroxeada: espuma em ruído fino, mais luz própria, menos reflexo rosa.
- Treliça apagada pela simplificação e painéis mostrando o verso liso: lista explícita de peças simplificáveis e painéis realocados.

## Medições (GTX 1650, 1300 x 1000, porta fechada, shaders já compilados)
- Alta: lounge 5,1 ms por quadro (200 draw calls); jacuzzi 2,7 ms; sentado na banheira 1,6 ms.
- Média: lounge 3,4 ms; jacuzzi 1,9 ms. Baixa: lounge 1,0 ms; jacuzzi 0,55 ms.

## Pendente
- Ver `context/open-questions.md`.
- Não verificado: movimento das cortinas de tecido em tempo real (só vi imagem parada); toque em celular; placa integrada.
