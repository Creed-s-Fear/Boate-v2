# 2026-11-15 16:20 — Correções da planta e mais detalhe de shader

## Feito
- Pedro apontou por captura: toalha enrolada flutuando na borda da banheira e lanterna dentro da espreguiçadeira.
- `tools/check-layout.mjs` (`npm run conferir`): acusa peças atravessadas e sem apoio a partir das caixas do inventário.
- Planta corrigida: toalha da borda removida; lanterna de 22° foi para 58°; espreguiçadeira e vaso do canto afastados;
  mesinhas do sofá mais abertas; aparador reorganizado (toalhas atravessadas, vela e frascos sem cruzar).
- 8ª execução no Blender (montagem + exportação) e GLB otimizado de novo.
- Aviso da jacuzzi só aparece perto da borda e olhando para ela; dentro da água vira "Sentar na água".
- Placas holográficas da parede do fundo (lótus e glifos): fundo com paralaxe em camadas, anéis pulsando, chuva de glifos
  procedural, faixa de dados, partículas e, na do lótus, a flor 3D saindo da placa.
- Shaders: vidro com borda e riscos de reflexo, líquidos que brilham e borbulham, veludo com grão e pelo amassado,
  fitas de neon com pontos de LED e pulso correndo.
- Brilho: passe que comprime picos antes do bloom, bloom mais fraco, piso e mármore com rugosidade mínima maior,
  reflexo do piso mais discreto, exposição 0,95.

## Decidido
- Ver `memory/decisions.md` (bloco "Correções e detalhe").

## Resolvido
- Toalha flutuando e lanterna atravessada: conferido pela checagem e por captura.
- Aviso "Entrar na jacuzzi" aparecendo longe ou de costas: testado em 5 posições.

## Medições (GTX 1650, 1300 x 1000, porta fechada)
- Alta: lounge 3,3 ms; bar de perto 2,3 ms. Baixa: lounge 0,9 ms; jacuzzi 0,6 ms. 203 draw calls no lounge.

## Pendente
- Alterações sem commit; o link público ainda mostra a versão anterior (falta `npm run publicar`).
- A checagem ainda acusa falso-positivos (sofá curvo em volta da mesa, folhas de palmeira sobre o sofá, toalha do topo da pilha).
