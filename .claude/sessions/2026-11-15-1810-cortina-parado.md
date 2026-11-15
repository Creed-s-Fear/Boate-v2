# 2026-11-15 18:10 — Cortina de fios tremendo com o jogador parado
> A hora do nome segue a sequência das sessões anteriores; o relógio da máquina marcava 16:50 no fechamento.

## Feito
- Pedro mostrou: parado dentro da cortina de fios, a animação dos fios se abrindo ficava "travando".
- Reproduzido por simulação: fios encostados no corpo tremiam de 13 a 64 cm sem parar e a altura de contato ficava ligando e desligando.
- Causa: ao encostar, a velocidade do fio era trocada a cada passo por um empurrão fixo para fora. Parado, virava um quique sem fim.
- Segunda causa: sem velocidade em volta do corpo, o fio cujo repouso ficou do outro lado não conseguia contorná-lo e ficava preso na frente.
- Correção em `src/engine/stringCurtain.js`: contato sem quique, atrito ao escorregar no corpo e empurrão em volta dele pelo caminho mais curto.
- Fios cujo repouso está debaixo do corpo se abrem em leque (cada um para o seu lado) em vez de empilhar num ponto só.

## Medido
- Quatro cenários simulados (ao longo do trilho, atravessando, parando 20 cm depois, atravessar e sair): nenhum fio preso do lado errado.
- Seis segundos depois de parar, o fio mais rápido anda a menos de 4 cm/s; antes o tremor não diminuía.
- Conferido na tela: com o corpo parado no meio, a cortina fica aberta em V em volta dele; por dentro, a vista fica livre.

## Decidido
- Ver `memory/decisions.md` (bloco "Jogo", última linha).

## Resolvido
- Tremor e fios presos com o jogador parado dentro da cortina de fios.

## Pendente
- Publicar (`npm run publicar`) e fazer o commit, junto com a otimização: aguardando o OK do Pedro.
- Ao parar de repente, os fios empurrados ainda balançam para a frente e voltam (já era assim); Pedro não reclamou disso.
