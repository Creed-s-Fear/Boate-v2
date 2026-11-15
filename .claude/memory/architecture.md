# Arquitetura

## Pastas
- `assets/drive/Objetos/` — os 104 GLB originais (Kit_Bordel e Jacuzzi); `assets/inventario.json` — medidas e materiais de cada um.
- `blender/boate.blend` — coleção PECAS (biblioteca LIB_*) e CENARIO (ROOM_club, ROOM_spa, COMUM).
- `blender/layout.json` — planta gerada; `blender/scripts/` — cópia dos scripts enviados pelo MCP; `blender/export/boate_raw.glb` — GLB bruto.
- `public/models/boate.glb` + `level.json` — o que o jogo carrega. Sem `level.json` o jogo usa o cenário provisório (`src/level/blockout.js`).
- `src/engine/` — graphics (bloom, qualidade), player, collision (BVH), world, wetfloor, water, stringCurtain, hologram.
- `src/level/` — loadLevel (GLB), kit (regras por nome), shaderFx (shaders enxertados por material), blockout.
- `src/tools/catalogo.js` + `catalogo.html` — só em dev.
- `tools/` — make-layout, optimize-glb, inspect/nodes/prims/hist-glb.

## Fluxo para mudar o cenário
1. Editar `tools/make-layout.mjs` e rodar `npm run planta`.
2. Enviar `blender/scripts/2_montar_e_exportar.py` pelo MCP (Pedro aprova); gera o .blend e o GLB bruto.
3. `npm run otimizar` e recarregar o jogo.

## Convenções
- Planta em metros, eixos do glTF (Y para cima, frente da peça = +Z), yaw em graus. No Blender: (x, y, z) -> (x, -z, y).
- Lounge: x -6..6, z -12..12. Corredor: x -1..1, z -16,25..-12,25. Jacuzzi: 10 x 10 m, centro em (-4,1; -21,45).
- Nomes lidos pelo jogo: `ROOM_<sala>`, `DOOR_<nome>` (door, angle, rooms), `SPAWN` (yaw), `COL_*`, `FILL_*`, luzes com `cd` e `dist`.
- Peças mantêm o nome do modelo (KIT_*, JAC_*): colisão, brilho e efeitos saem daí (`src/level/kit.js`).
- Objetos com a propriedade `gerado` são apagados e recriados a cada montagem; ajuste manual neles se perde.
- Parede compartilhada entre salas fica fora dos `ROOM_` (coleção COMUM) para não sumir com a sala.

## Depuração
- `?stats` mostra fps, draw calls e triângulos; `?q=baixa|media|alta` força a qualidade.
- `window.__game` expõe mundo, jogador e `sim(segundos)` para testes em passos fixos.
