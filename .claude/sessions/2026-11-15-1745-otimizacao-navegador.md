# 2026-11-15 17:45 — Otimização para navegador
> A hora do nome segue a sequência das sessões anteriores; o relógio da máquina marcava 16:30 no fechamento.

## Feito
- Pedro pediu: "dá uma otimizada em tudo para navegador". Feito com medição antes e depois, sem mudar a imagem.
- Carga: shaders pedidos de uma vez e compilados em paralelo pelo navegador; antes compilavam um a um e travavam a página.
- Carga: só a sala inicial fica pronta antes do botão "Entrar"; a outra sala e a porta aberta terminam em segundo plano.
- Carga: a captura do ambiente usa os mesmos shaders do jogo (ambiente provisório preto), sem um conjunto só dela.
- Carga: junção de malhas reescrita em `src/engine/merge.js` (escreve direto nos vetores finais); conversão do GLB para float sem chamadas por vértice.
- Carga: colisão de paredes inteiras, pisos e colunas virou caixa; triângulos da colisão de 252 mil para 89 mil.
- Rede: o GLB começa a baixar junto com o código (pré-carga gerada no build, com resumo do conteúdo no endereço).
- Rede: carregador do GLB entrou no pacote principal (menos idas ao servidor); KTX2 e basis, sem uso, saíram do build.
- Quadro: o passe final faz também o mapeamento de tons e a cor de tela (um passe de tela cheia a menos).
- Quadro: com o menu na frente o jogo desenha umas 12 vezes por segundo; o aviso da tecla E só toca a página quando muda.
- Qualidade: nível inicial pela placa de vídeo, escolha guardada no navegador, queda automática de nível.
- Nível "alta": densidade de pixels limitada a 1,5 e reflexo do piso a 0,5 da resolução.
- `.claude/launch.json` ganhou `boate-producao` (serve o `dist/` na porta 4173) para testar o build.

## Medido (GTX 1650, build de produção)
- Botão "Entrar": ~1,34 s na versão publicada, ~0,70 s na nova servida localmente (a rede não é a mesma nas duas medidas).
- Página travada na carga: ~1,08 s antes, com um trecho único de 779 ms; agora montar ~170 ms e preparar vídeo ~190 ms, em pedaços.
- Imagem comparada em 4 poses contra a versão publicada: diferença máxima de 1 em 255.
- Caminhada automática: boate, corredor, porta, plataforma, entrar e sair da jacuzzi, paredes das duas salas. Tudo passou.
- 88 shaders vivos ao fim da carga, nenhum criado depois dela (sem duplicatas).

## Decidido
- Ver `memory/decisions.md` (bloco "Desempenho").

## Resolvido
- O ajuste automático rebaixava a qualidade em aba com taxa de quadros travada; agora desfaz a redução que não melhora a taxa.
- `timings.total` saía negativo; agora é o tempo desde o início da navegação.

## Pendente
- Publicar (`npm run publicar`) e fazer o commit: aguardando o OK do Pedro.
- Sem medida em placa integrada nem em celular; o ajuste automático foi testado só com taxas simuladas.
- O download não diminuiu: o GitHub Pages já entrega o GLB com gzip (~1 MB na rede).
- Custo por quadro quase igual ao de antes (um passe de tela cheia a menos); o ganho grande foi na carga.
