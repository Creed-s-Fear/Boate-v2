# Estado atual — Boate (Jack of Hearts)
> Retrato reescrito a cada /compress. Última atualização: 2026-11-17.

## Projeto
- Ambiente 3D jogável no navegador: boate (lounge) ligada por corredor e porta à suíte da jacuzzi, com as regras do PeekHole por cima.
- Referências: imagem da entrada "Jack of Hearts". Nome na tela: "Jack of Hearts". Conteúdo adulto não explícito, com verificação de idade.

## O que existe
- Motor em three.js + Vite (`src/engine/`): primeira pessoa, colisão, jacuzzi, bloom, reflexo do piso, cortina de fios, holograma.
- Cenário montado no Blender pelo MCP a partir de `blender/layout.json` (377 peças, 22 preenchimentos, 13 luzes).
- Jogo em `src/game/` e `src/ui/` (TypeScript): terminal (pulseira, VIP, reserva da suíte, caixa, armário), segurança, bar, anfitriãs, cenas.
- Também: NPCs, assentos, dança, 3ª pessoa (V), agachar (C), HUD com minimapa, áudio procedural, save no navegador. Qualidade na tecla Q.
- Personagens com esqueleto em `public/models/personagens/` (gerados por `npm run personagens`; fontes fora do git).
- Contas com depósito em SOL em `server/` (Fastify + Postgres, devnet): só rodam localmente; o link público não tem servidor.
- Carga otimizada (shaders em paralelo, sala inicial primeiro, GLB em pré-carga) e qualidade inicial pela placa de vídeo.
- Build de produção: JS 1,06 MB (0,29 MB com gzip), cenário ~1 MB na rede, personagens ~8 MB baixados depois que o jogo abre.

## Ferramentas
- `npm run dev` (5173, com proxy de `/api` para 8787), `npm run build` (tsc + vite), `npm run typecheck`, `npm run personagens`.
- `npm run planta`, `npm run otimizar`, `npm run conferir`, `npm run publicar` (atualiza o link público).
- `.claude/launch.json`: `boate` (dev), `boate-producao` (preview) e `boate-estatico` (serve `dist/` como o GitHub Pages, sem API).
- Código novo em `Creed-s-Fear/Boate-v2` (`main`, público). `Creed-s-Fear/boate` (`main`) está um commit atrás e guarda o `gh-pages`.
- Link para jogar: `https://creed-s-fear.github.io/boate/` (ramo `gh-pages` do `boate`), publicado em 17/11 com o código do `Boate-v2`.
- Nesta pasta: remoto `origin` = `boate`, remoto `v2` = `Boate-v2`; o `main` local é igual ao `v2/main`.
- Os outros repositórios da organização não são deste projeto e não se mexe neles.
- Blender 5.2 + MCP oficial; trava `blender_mcp_guard.py` liberada para `c:/boate/` em 2026-11-15 a pedido do Pedro.

## Em andamento
- Jogo do PeekHole no link público desde 17/11, como visitante (dinheiro de mentira); a área de conta fica escondida sem servidor.
- Escolha do Pedro (17/11): o commit do jogo fica só no `Boate-v2`. O `main` do `boate` não recebe; o `boate` segue servindo o link.
- Kit da entrada (17/11): 22 peças `ENT_*` em `blender/entrada.blend`, montagem em `public/models/entrada.glb`.
- Cutscene de entrada (18/11): `Entrance` carrega o GLB, `IntroDirector` anima 9s em 5 fases (fade, caminhada, porta, entra, fade).
  Portas animadas preservando rotação base do GLB; `world.setOutside()` esconde o nível durante a cena.

## Próximos 3 passos
1. Medir em placa integrada e em celular: com os NPCs são cerca de 355 draw calls e 1,6 milhão de triângulos em "alta".
2. Pôr regras de colisão às peças `ENT_*` em `src/level/kit.js` (o kit é só visual por enquanto).
3. Se as contas forem para o ar: hospedar o `server/`, verificação de idade de verdade e jurídico antes de qualquer mainnet.

## Riscos
- O link é público e o conteúdo é adulto: a verificação de idade é só um clique.
- Depósito em SOL só existe na devnet e só local: nenhum dinheiro real foi ligado.
- Toque não foi testado em celular; a colisão por caixa foi conferida por caminhada automática, não por alguém jogando.
- Cutscene testada só no desktop; em celular pode ter desempenho diferente.

## Última sessão
- `sessions/2026-11-18-cutscene-entrada.md` (antes: `2026-11-17-2215-kit-entrada`)
