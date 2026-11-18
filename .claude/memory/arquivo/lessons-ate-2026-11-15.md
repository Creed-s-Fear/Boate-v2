# Lições movidas de `memory/lessons.md` em 2026-11-17 (sem edição; continuam valendo)

## Assets
- Materiais com textura procedural chegam brancos no GLB (j_wall, j_floor, j_marble, marble, floor_wet).
- As peças não têm textura e compartilham uma biblioteca de materiais KIT_*; unificar duplicatas (.001) depois de importar.
- Neon original usa força 8 a 12: no jogo isso estoura o bloom; brilho é remapeado por nome em `kit.js`.
- A parede JAC_33 já traz uma porta falsa embutida (cópia da JAC_38) em x = -4,10.

## Jogo
- GLB com meshopt guarda posições como inteiros e embute escala nos nós: converter para float ao carregar e criar colisores em mundo.
- `pow()` com base negativa em shader gera NaN e o bloom deixa a tela inteira preta: sempre `clamp` antes.
