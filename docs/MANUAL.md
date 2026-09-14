# Manual do Pi (este setup)

Cola de consulta rápida. Comandos com `/` usam Tab para autocompletar.

## Sessão

| Comando | Para quê |
|---|---|
| `/new` | Nova sessão (limpa) |
| `/resume` | Reabrir sessão passada (busca, `Ctrl+R` renomeia, `Ctrl+D` apaga, `Ctrl+N` só nomeadas) |
| `/name <nome>` | Nomeia a sessão atual (aparece no footer e no `/resume`) |
| `/session` | Arquivo, ID, mensagens, tokens e custo da sessão |
| `/tree` | Volta a qualquer ponto e continua dali (mesmo arquivo). `Shift+L` etiqueta, `Ctrl+O` troca filtro, `Enter` seleciona |
| `/fork` | Novo arquivo de sessão a partir de uma mensagem antiga |
| `/clone` | Duplica a branch atual em um arquivo novo (antes de refactor arriscado) |
| `/compact [foco]` | Resume contexto agora (opcional: `ex: foque em auth`) |
| `/export [arq]` | Salva sessão em HTML |
| `/share` | Link HTML via gist privado |
| `/import <arq>` | Retoma sessão de um JSONL |
| `/copy` | Copia última resposta do agente |
| `/trust` | Salva decisão de confiança do projeto atual |
| `/reload` | Recarrega extensions/skills/prompts/temas/AGENTS.md (rode após mudar config) |
| `/quit` | Sair |

## Modelo

| Comando | Para quê |
|---|---|
| `/model` | Troca modelo. **`Ctrl+S` salva como default de inicialização** |
| `/thinking` | Troca thinking `off→max`. **`Ctrl+S` salva default**. `Shift+Tab` cicla direto |
| `/scoped-models` | Liga/desliga modelos do ciclo `Ctrl+P` |
| `/login` / `/logout` | Auth OAuth/API key por provider |
| `/settings` | Tema, delivery, transporte e preferências |
| `/llama` | Baixa/liga/desliga modelos locais (llama.cpp) |

## Goal e continuação (nossas extensions)

| Comando | Para quê |
|---|---|
| `/goal <texto>` | Ativa standing goal + começa passo 1. Aceita contrato: `outcome:`, `verify:`, `constraints:`/`preserve:`, `boundaries:`/`scope:`, `stop when:`/`blocked:` |
| `/goal draft <ideia>` | Expande one-liner em contrato e começa |
| `/goal status` | Mostra goal ativo e step (`◎ goal (step N/25)` fica acima do editor) |
| `/goal clear` | Desliga o goal |
| `/handoff-off` | Desliga o handoff-compact automático desta sessão |
| `/ow <nome>` | Cria worktree Orca + terminal com pi dentro (paralelo/destrutivo) |

Handoff-compact dispara sozinho 1x por sessão: 70% do contexto em 2 turnos seguidos → resume dentro da sessão + salva `%TEMP%\pi-handoffs\*.md` + abre terminal Orca novo continuando.

## Guard, snippets, browser

| Comando | Para quê |
|---|---|
| `/ps-guard` / `/ps-guard on\|off` | Liga/desliga bloqueio de comandos destrutivos PowerShell |
| `/snippets` ou `Alt+S` | Liga regras por-mensagem (`Espaço` marca, `Tab` prevê, `Enter` aplica). Zera após enviar |
| `/browser on\|off` | Liga as 8 tools `browser_*` (só quando for debugar frontend) |
| `/builtin-header` | Volta ao header padrão do Pi |

## Skills (`/skill:nome`, Tab lista todas)

| Skill | Quando chamar |
|---|---|
| `/skill:web-debug` | Bug visual/auth/401/tela branca — dirige o browser de verdade |
| `/skill:analyze-sessions` | Custo por dia/projeto/modelo, minerar seus padrões de prompt |
| `/skill:pdf-reader` | Ler PDF com matemática/diagramas (triage → texto + imagens) |
| `/skill:youtube-transcript` | Transcript de vídeo EN com legenda |
| `/skill:goal-loop` | Protocolo do standing goal (o `/goal` implementa) |
| `/skill:handoff` | Handoff manual em arquivo (alternativa ao automático) |

## Editor

| Atalho | Ação |
|---|---|
| `@` | Busca fuzzy de arquivos do projeto |
| `Tab` | Completa paths e comandos |
| `Shift+Enter` | Quebra de linha (no Windows Terminal pode ser `Ctrl+Enter`) |
| `!comando` | Roda shell e manda saída pro modelo |
| `!!comando` | Roda shell sem mandar pro modelo |
| `Ctrl+G` | Abre prompt no **editor do Orca** (volta sozinho ~3s após salvar; sem edição cancela; `Ctrl+C` cancela já; fora de worktree cai no Notepad) |
| Colar / arrastar | `Ctrl+V` (no Windows pode ser `Alt+V`) cola imagem/texto |

## Fila (falar com agente ocupado)

| Atalho | Ação |
|---|---|
| `Enter` | Steering: entrega após o turno atual (interrompe raciocínio) |
| `Ctrl+Q` | Follow-up: entrega quando o agente terminar tudo (Windows; `Alt+Enter` no Linux/mac) |
| `Alt+Q` | Devolve mensagens da fila pro editor (Windows) |
| `Esc` | Aborta e restaura fila no editor |

## Teclas gerais (Windows)

| Atalho | Ação |
|---|---|
| `Esc` | Interromper agente |
| `Ctrl+C` | 1º limpa editor, 2º sai |
| `Ctrl+D` | Sai (editor vazio) |
| `Ctrl+P` | Cicla modelo |
| `Ctrl+L` | Seletor de modelo |
| `Ctrl+T` | Liga/desliga thinking |
| `Ctrl+O` | Expande/recolhe output das tools |
| `Ctrl+X` | Copia última resposta (ou seleção no `/tree`) |

No Linux/macOS: `Alt+Enter` follow-up, `Alt+Up` dequeue, resto igual.
