# Sessão 2026-11-18 — Cutscene de entrada

## O que foi feito
- Criado `src/game/entrance.ts`: carrega `entrada.glb`, posiciona a fachada,
  cria iluminação de rua, anima portas (preservando rotação base do GLB).
- Criado `src/game/intro.ts`: `IntroDirector` com 4 fases (fade-in, caminhada,
  entra, fade-out) em 9 segundos. Retorna por frame: posição, câmera,
  fade e mix de áudio.
- `game.ts`: `prepareIntro()` async, `playIntro()` com step wait+onUpdate.
- `world.js`: `setOutside(on)` esconde o nível durante a cutscene.
- `main.js`: chama `prepareIntro` no boot, `playIntro` ao entrar.
- `cutscene.ts`: suporte a step `wait` com `onUpdate(t)`.

## Bugs corrigidos
- Rotação dupla: `setDoor` animava filhos junto com pais. Correção:
  animar só nós raiz, guardar `baseY`.
- Jogador passava pelo vidro: `DOOR_CENTER_X=0.6` punha o jogador no
  meio da E002 (fechada). D001 já está aberta a -78° no GLB; removida
  a animação de portas e ajustado `DOOR_CENTER_X=0` para alinhar o
  jogador com o vão do batente_simples002 (abertura da D001).
- Jogador atravessava a parede: fase WALK_IN mostrava o jogador
  passando pela parede de tijolo. Substituída por transição com
  fade to black (4.5-5.5s) que esconde a troca de geometria.

## Decisões
- GLB da montagem (`entrada.glb`, 744 KB) em vez de carregar 22 peças.
- Cutscene de 9s com smoothstep: longa o bastante para ver a fachada,
  curta o bastante para não cansar. Pular com Esc segurado.
- Áudio abafado (lowpass 800 Hz) do lado de fora, abre para 16 kHz ao entrar.

## Commits (v2/main)
- `1d6e0a2` Cutscene de entrada: jogador abre a porta e entra no clube
- `bba912a` Memoria: cutscene de entrada e kit da fachada
- `bf31b13` Memoria: sessao da cutscene de entrada
- `0d52d08` Cutscene de entrada: jogador passa pela porta ja aberta (D001)
- `9e9c986` Cutscene de entrada: transicao fade ao entrar no clube
