# Sessão 2026-11-18 — Cutscene de entrada

## O que foi feito
- Criado `src/game/entrance.ts`: carrega `entrada.glb`, posiciona a fachada,
  cria iluminação de rua, anima portas (preservando rotação base do GLB).
- Criado `src/game/intro.ts`: `IntroDirector` com 5 fases (fade-in, caminhada,
  porta abre, entra, fade-out) em 9 segundos. Retorna por frame: posição,
  câmera, abertura da porta, fade e mix de áudio.
- `game.ts`: `prepareIntro()` async, `playIntro()` com step wait+onUpdate.
- `world.js`: `setOutside(on)` esconde o nível durante a cutscene.
- `main.js`: chama `prepareIntro` no boot, `playIntro` ao entrar.
- `cutscene.ts`: suporte a step `wait` com `onUpdate(t)`.

## Bug da porta
- Versão inicial: `setDoor` sobrescrevia rotation.y e animava TODOS os
  objetos `Porta_Vidro` (inclusive filhos), causando rotação dupla.
- Correção: animar só os 4 nós raiz (filhos diretos da cena ENTRADA),
  guardar `baseY` de cada folha, calcular ângulo restante até `OPEN_ANGLE`
  para portas que já têm rotação base (ex.: D001 com giro -78° do Blender).

## Decisões
- GLB da montagem (`entrada.glb`, 744 KB) em vez de carregar 22 peças.
- Cutscene de 9s com smoothstep: longa o bastante para ver a fachada,
  curta o bastante para não cansar. Pular com Esc segurado.
- Áudio abafado (lowpass 800 Hz) do lado de fora, abre para 16 kHz ao entrar.

## Commits
- `1d6e0a2` Cutscene de entrada: jogador abre a porta e entra no clube
- `bba912a` Memoria: cutscene de entrada e kit da fachada
- Ambos em `v2/main` (Boate-v2).
