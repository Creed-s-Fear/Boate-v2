# Lições (armadilhas e soluções)

> As lições de assets e as duas primeiras de jogo (2026-11-15) estão em `arquivo/lessons-ate-2026-11-15.md`.

## Blender e MCP
- A trava barra `.unlink(` mesmo sendo `collection.objects.unlink`; importar direto na coleção ativa evita a chamada.
- Exportador glTF do Blender 5.2: passar `export_loglevel` quebra com KeyError 'loglevel'. Não passar.
- Cada exportação devolve um log enorme no retorno do MCP; exportar só quando a planta mudar de fato.
- Booleano EXACT na parede inteira deixou sobra de geometria: partes abertas (treliças) confundem dentro/fora. Recortar só cascas fechadas.
- Malha importada de glTF vem com vértices duplicados nas quinas; para achar as "cascas" é preciso agrupar por posição, não por conectividade.
- Captura da janela do Blender pelo MCP veio preta (janela minimizada); validar pelo GLB no jogo.
- Abrir o Blender só pelo atalho do Pedro, `C:\gameifba\Tools\Blender\abrir_blender_mcp.ps1` (servidor só na sessão); aberto à mão não conecta.
- Rodar `blender.exe` direto pelo terminal foge do fluxo de aprovação do Pedro: não fazer.
- `image.pixels.foreach_set` pede `image.update()` antes de `image.save()`; sem isso a textura gerada por código sai preta.

## Jogo
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
- `KIT_Sofa_Curvo` e `KIT_Cama_Redonda` já trazem almofadas modeladas; `JAC_05_Sofa` vem sem. Medir com `profile-glb.mjs` antes.
- O link público só muda com `npm run publicar` e a página fica em cache: recarregar com `?v=N` para ver a versão nova.
- Antes de abrir um repositório, ver o e-mail dos commits (`git log --format=%ae`); depois de renomear ou criar, conferir a visibilidade pela API.
- Sobrescrever histórico não basta para esconder dado em repositório que vai ficar público: publicar como repositório novo.
- Contato que troca a velocidade por um empurrão fixo quica para sempre com o jogador parado: tirar só a parte que entra no corpo.

## Desempenho
- Shader do three.js depende do número de luzes visíveis, do tipo do mapa de ambiente, do alvo de desenho e dos atributos da malha.
- Pré-compilar fora desse contexto gera shader duplicado: conferir se `renderer.info.programs.length` não cresce depois da carga.
- `renderer.compile` percorre também objetos invisíveis: tirar da cena as salas de fora antes de pedir os shaders de uma combinação.
- Ajuste automático pela taxa de quadros tem de conferir se a redução ajudou: taxa travada por fora (30 Hz, aba oculta) rebaixava tudo.
- O GitHub Pages já entrega o GLB com gzip (2,7 MB viram ~1 MB na rede): comprimir de novo não ganha nada.
- Com o painel do navegador escondido os temporizadores atrasam ~1 s: tempo de carga só vale medido com o painel à vista.

## Painel do navegador
- Aba em segundo plano não apresenta quadros (captura preta) e limita o requestAnimationFrame; usar `__game.sim()` e trazer a aba para frente.
- Editar código recarrega todas as abas do jogo, inclusive a que o Pedro está usando.
- O ajuste automático de resolução não pode contar pausas longas como "lento" (aba oculta derrubava a resolução).
- 2026-11-16 — Dois ouvintes de keydown no window: o do Player (registrado antes) abria o menu com E e o do main fechava no mesmo evento (E fecha menu). O do main agora é de captura e para a propagação quando o menu consome a tecla. Testar menus com tecla de verdade, não chamando a ação por script.

## Modelos gerados por IA (2026-11-16)
- Vêm com mão fundida no quadril, animações vazias e contorno claro na textura da roupa: inspecionar com luz neutra e comparar com o original antes de culpar o pipeline.
- Cortar influência de membro por raio cria costura se o raio for justo; usar transição suave e regra específica para cabelo.
