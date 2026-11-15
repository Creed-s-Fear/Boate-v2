# 2026-11-15 13:30 — Base do jogo e montagem com as peças do Drive

## Feito
- Base do jogo em three.js + Vite: primeira pessoa, colisão por BVH, porta, bloom, reflexo de piso, água, vapor, qualidade adaptativa.
- Cenário provisório em código para testar andar, colidir e abrir porta antes das peças chegarem.
- Pasta "3D Assets" do Drive: baixado `Assets_Objetos.zip` (104 GLB, 3,4 MB) e extraído em `assets/drive`.
- Catálogo visual das peças e ferramentas de medição de GLB (tamanho, materiais, histogramas).
- Planta gerada por script (`layout.json`): 382 peças, 22 preenchimentos, 13 luzes; 100 de 104 modelos usados.
- Blender pelo MCP: biblioteca PECAS (300 materiais repetidos unificados, 69 restantes), montagem em CENARIO, exportação do GLB.
- Otimização do GLB: 9,9 MB -> 2,5 MB; triângulos das malhas únicas a 71%.
- Jogo adaptado às peças: regras por nome, junção de malhas (cerca de 1.540 malhas -> 108 lotes), luzes por propriedade.
- Cortina de fios de neon com física por fio; holograma refeito em shader; jacuzzi atravessável.
- Memória do projeto criada (`.claude/`) e atalhos `/retomar-boate` e `/salvar-boate`.

## Decidido
- Ver `memory/decisions.md` (todas de hoje).

## Resolvido
- Acesso à pasta do Drive: aprovado durante a sessão.
- Trava do Blender bloqueava `C:\boate`: liberada a pedido do Pedro (edição feita por mim, aprovada por ele).
- Vão da porta com sobra de geometria: refeito recortando só cascas fechadas.
- Jogador atravessava o piso com o GLB otimizado: posições convertidas para float ao carregar.
- Entrada da jacuzzi bloqueada por espreguiçadeira e painéis: planta ajustada.
- Tela preta ao olhar o holograma: NaN de `pow()` no shader, corrigido com clamp.

## Medições (GTX 1650, 1300 x 1000)
- Qualidade alta: lounge 4,0 ms por quadro (200 draw calls, 877 mil triângulos com reflexo); jacuzzi 3,0 ms.
- Qualidade baixa: lounge 1,8 ms; jacuzzi 0,7 ms.

## Pendente
- Ver `context/open-questions.md`.
- Não verificado: toque em celular; desempenho em placa integrada; aparência da cena dentro do próprio Blender (captura veio preta).
- No início da sessão rodei o `blender.exe` direto duas vezes (leitura de preferências e criação do .blend vazio), antes de
  conhecer as regras do Pedro para o Blender MCP. Avisei e não repeti.
