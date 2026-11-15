# Lições (armadilhas e soluções)

## Blender e MCP
- A trava barra `.unlink(` mesmo sendo `collection.objects.unlink`; importar direto na coleção ativa evita a chamada.
- Exportador glTF do Blender 5.2: passar `export_loglevel` quebra com KeyError 'loglevel'. Não passar.
- Cada exportação devolve um log enorme no retorno do MCP; exportar só quando a planta mudar de fato.
- Booleano EXACT na parede inteira deixou sobra de geometria: partes abertas (treliças) confundem dentro/fora. Recortar só cascas fechadas.
- Malha importada de glTF vem com vértices duplicados nas quinas; para achar as "cascas" é preciso agrupar por posição, não por conectividade.
- Captura da janela do Blender pelo MCP veio preta (janela minimizada); validar pelo GLB no jogo.
- O Blender precisa ser aberto pelo atalho do Pedro (servidor só na sessão); início automático e acesso online ficam desligados.
- Rodar `blender.exe` direto pelo terminal foge do fluxo de aprovação do Pedro: não fazer.

## Assets
- Materiais com textura procedural chegam brancos no GLB (j_wall, j_floor, j_marble, marble, floor_wet).
- As peças não têm textura e compartilham uma biblioteca de materiais KIT_*; unificar duplicatas (.001) depois de importar.
- Neon original usa força 8 a 12: no jogo isso estoura o bloom; brilho é remapeado por nome em `kit.js`.
- A parede JAC_33 já traz uma porta falsa embutida (cópia da JAC_38) em x = -4,10.

## Jogo
- GLB com meshopt guarda posições como inteiros e embute escala nos nós: converter para float ao carregar e criar colisores em mundo.
- `pow()` com base negativa em shader gera NaN e o bloom deixa a tela inteira preta: sempre `clamp` antes.
- Brilho aditivo de muitas camadas sobrepostas (pétalas) estoura em branco: usar intensidade baixa por camada.
- "Colar no chão" com velocidade alta para baixo impede subir degrau; no chão usar só a gravidade de um passo.
- Móvel perto da porta bloqueia a entrada: testar caminhada automática (`__game.sim`) depois de cada mudança de planta.

- Simplificar todas as malhas apaga barras finas (treliça) e some com primitivas pequenas: simplificar só por lista explícita.
- Peças avulsas com verso liso (JAC_37) precisam ficar encostadas em parede; soltas no meio da sala mostram o verso.
- Medir desempenho só com a porta fechada e depois de alguns quadros: trocar a qualidade recompila shaders e distorce a medida.
- O que a tecla E alcança deve ser calculado no passo de simulação, não no quadro: em aba em segundo plano o quadro não roda.
- `logging.disable(logging.INFO)` em volta da exportação glTF corta o log gigante do exportador no retorno do MCP.

- Posicionar por ângulo e raio em volta da plataforma colide com móveis: rodar `npm run conferir` depois de mexer na planta.
- Rugosidade abaixo de 0,1 com luz pontual gera ponto de reflexo de 10x o branco: o bloom transforma em clarão.
- Risco de reflexo por normal em vidro plano vira clarão quando a câmera gira: restringir às partes curvas.

## Painel do navegador
- Aba em segundo plano não apresenta quadros (captura preta) e limita o requestAnimationFrame; usar `__game.sim()` e trazer a aba para frente.
- Editar código recarrega todas as abas do jogo, inclusive a que o Pedro está usando.
- O ajuste automático de resolução não pode contar pausas longas como "lento" (aba oculta derrubava a resolução).
