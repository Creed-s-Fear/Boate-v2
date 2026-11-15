---
description: Salva o essencial da sessão em .claude/ (sessão, memória e contexto), com limites, arquivamento e checagem de segredos
---

Persista o conhecimento desta sessão em `.claude/` (índice e limites em `.claude/README.md`). Nunca apague arquivo: o que sai de um arquivo vai para `arquivo/`.

**Segurança primeiro.** A pasta pode ir para um repositório lido por outras pessoas.
- Nunca grave senha, token, chave, cookie, e-mail pessoal, telefone, id de convite, link com token
  nem caminho de pasta temporária (scratchpad, Temp). Na dúvida, não grave e pergunte ao Pedro (fail secure).

**Passos**
1. Releia cada arquivo logo antes de gravá-lo e edite só a parte que muda (outra sessão pode ter mexido).
2. Sessão: crie `sessions/AAAA-MM-DD-HHMM-<tema>.md` (hora de início do bloco, sem repetir um nome existente; tema curto, sem acento).
   Seções Feito, Decidido, Resolvido e Pendente, em bullets curtos. Sessão gravada não se edita depois (só para tirar um segredo).
3. `memory/decisions.md`: uma linha por decisão nova, `AAAA-MM-DD — decisão — porquê`. Sem coordenadas, cores ou medidas
   (vão para a sessão ou para o código). Decisão substituída sai da lista e vai para `memory/arquivo/decisoes-substituidas.md`.
4. `memory/lessons.md`, `architecture.md` e `preferences.md`: só se algo mudou. Procure duplicata antes de acrescentar;
   fato vencido vira a versão atual, com a data. Uma fonte por fato.
5. `context/open-questions.md`: só itens abertos, `- [ ] (AAAA-MM-DD) pendência — dono ou gatilho`.
   O resolvido sai no mesmo /compress e vira "Resolvido: ..." na sessão do dia. Nada de `[x]`.
6. `context/current.md`: reescreva inteiro, no presente, com as mesmas seções (Projeto, O que existe, Ferramentas, Em andamento,
   Próximos 3 passos, Riscos, Última sessão). Antes, garanta que todo fato que sai já está numa sessão ou em `decisions.md`.
7. Limites, com linhas de até 200 caracteres: current 50, open-questions 40, decisions 80, lessons 50, architecture 40,
   preferences 20, sessão 40. Se passar, mova sem editar as entradas mais antigas para `arquivo/` e deixe um ponteiro.
8. Antes de encerrar, confira por grep SÓ os arquivos criados ou alterados neste /compress:
   - linhas e tamanho contra os limites (leitura inicial do /resume até ~35 KB);
   - BLOQUEIA: `gh[opsur]_|github_pat_|sk-[A-Za-z0-9]{16,}|AKIA|BEGIN [A-Z ]*PRIVATE KEY|Bearer `, `(senha|password|token)\s*[:=]`,
     e-mail pessoal, telefone, `invitations/`, `.ssh`, `.credentials`, `.env`, `AppData`, `Temp\`, `scratchpad`;
   - `[x]` em `open-questions.md`.
9. Não faça commit nem push sem o Pedro pedir.
10. No fim, diga em 2 ou 3 linhas o que foi salvo e onde.

$ARGUMENTS
