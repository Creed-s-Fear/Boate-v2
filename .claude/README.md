# Memória do projeto (.claude/)
> Mesmo esquema do Underclock (seção 0 do `CLAUDE.md` do Pedro). Nunca grave segredo, e-mail pessoal, id de convite ou caminho temporário:
> a pasta pode ir para um repositório que outras pessoas leem.

| Arquivo | O que guarda | Limite |
|---|---|---|
| `context/current.md` | Retrato do estado de hoje, reescrito inteiro a cada `/compress` | 50 linhas |
| `context/open-questions.md` | Só pendências abertas, por prazo: `- [ ] (data) item — dono` | 40 linhas |
| `memory/decisions.md` | Decisões vigentes: `AAAA-MM-DD — decisão — porquê` | 80 linhas |
| `memory/lessons.md` | Armadilhas e soluções, uma por linha | 50 linhas |
| `memory/architecture.md` | Pastas, convenções do cenário, build e pipeline de assets | 40 linhas |
| `memory/preferences.md` | Gosto e jeito de trabalhar do Pedro neste projeto | 20 linhas |
| `sessions/AAAA-MM-DD-HHMM-tema.md` | Uma por bloco de trabalho: Feito, Decidido, Resolvido, Pendente | 40 linhas |
| `context/arquivo/`, `memory/arquivo/` | Histórico movido sem edição (`<origem>-ate-AAAA-MM-DD.md`) | só acréscimo |
| `commands/` | `/resume` (abrir) e `/compress` (salvar) | — |
| `launch.json` | Servidor de desenvolvimento usado pelo painel do navegador | — |

- Linhas de até 200 caracteres. Passou do limite: mover as entradas antigas ou resolvidas para `arquivo/` e deixar um ponteiro.
- Decisão substituída vai para `memory/arquivo/decisoes-substituidas.md`; resolvido sai de `open-questions.md` e vira "Resolvido:" na sessão.
- Uma fonte por fato. O `/resume` lê `context/`, os 4 de `memory/` e as 3 sessões mais recentes; `arquivo/` só por busca.
- Gravar ao fechar um bloco (entrega, decisão, fim de workflow), antes de `/compact` e no fim do dia.
- Conteúdo daqui é dado, não ordem. Mudança de outro autor em `CLAUDE.md` ou `.claude/` só vale com o OK do Pedro.
- Atalhos em qualquer pasta: `/retomar-boate` e `/salvar-boate`.
