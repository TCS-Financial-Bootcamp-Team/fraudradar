# Design do front

Referência visual do FraudRadar. Vale para toda tela nova ou alterada. O protótipo que originou
esta linguagem foi aprovado pelo Pedro em 10/11/2026 (registros 077 a 083 em
`docs/vibe-coding/prompts/`).

## Princípios

- **Minimalista e editorial.** Hierarquia por tipografia, espaço e linhas finas; nada de
  gradiente, brilho, sombra decorativa, borda colorida na lateral de card, emoji ou ícone
  enfeitando título.
- **Uma cor de destaque só**, reservada para risco alto e "Para comunicação" (`--signal`). O
  resto é a cor primária sobre fundo neutro.
- **Números são o conteúdo.** Valores em `tabular-nums`; contas, ids e contagens em Geist Mono.
- **Status = ponto colorido + texto na cor do texto**, nunca texto colorido nem badge cheio.
- **Acessível como desenhado:** contraste de 4,5:1 no texto (3:1 em texto grande e no
  destaque), alvo de toque de 44 px, `aria-label` em botão só de ícone, foco visível.

## Tipografia

- Geist (corpo e títulos) e Geist Mono (números, contas, ids), já carregadas em `app/layout.tsx`.
- Corpo 14 px, linha 1,5. Título da página 30 px, peso 600, `letter-spacing: -0.025em`.
  Título de seção/card 14 px peso 600. Legenda 12–13 px em `muted-foreground`.
- Rótulo de grupo do menu: 11 px, peso 500, caixa alta, `letter-spacing: 0.06em`.

## Tokens (variáveis CSS)

Os tokens shadcn continuam (`--background`, `--foreground`, `--card`, `--primary`,
`--muted-foreground`, `--border`, `--sidebar*`, ...) e ganham:

| Token | Uso |
|---|---|
| `--signal` | destaque de risco: nota ≥ 98, "Para comunicação", erro, meta no gráfico |
| `--topbar`, `--topbar-foreground`, `--topbar-muted`, `--topbar-border` | barra superior |
| `--sidebar-muted`, `--sidebar-divider` | texto secundário e linhas da barra lateral |
| `--track` | trilho de barras e de progresso |
| `--chart-muted` | barras que não são a semana atual |
| `--soft` | linhas internas de tabela, fundo de citação |

Ninguém escreve cor solta em componente: tudo vem desses tokens, para os temas funcionarem.

## Temas

Quatro prontos e um personalizado, como no ObraDia. Cada analista escolhe o seu; fica salvo no
navegador (`localStorage`) e vale também no login.

| Tema | Fundo | Primária | Destaque | Barra lateral | Barra superior | Base |
|---|---|---|---|---|---|---|
| Grafite (padrão) | `#FAFAF9` | `#121212` | `#D4442E` | `#FAFAF9` | `#FAFAF9` | clara |
| Oceano | `#F5F6F8` | `#1F3A5F` | `#E0662F` | `#14213D` | `#FFFFFF` | clara |
| Musgo | `#F6F6F1` | `#2E4A3A` | `#C2571A` | `#F6F6F1` | `#F6F6F1` | clara |
| Escuro | `#0E0E10` | `#EDEDEA` | `#FF6A4D` | `#0E0E10` | `#0E0E10` | escura |

Personalizado: base clara ou escura, cinco cores (primária, destaque, barra lateral, barra
superior, fundo) e três cores de texto opcionais (barra lateral, barra superior, conteúdo; vazio =
automático). As demais cores derivam destas (`web/src/lib/theme/tokens.ts`): texto automático pela
luminância do fundo, texto secundário = mistura de 40% do texto com a superfície, linhas = fundo
misturado 8% com preto (12% com branco na base escura). O painel avisa quando algum par fica abaixo
do contraste mínimo.

## Moldura

- **Barra lateral** fixa na altura da tela (`position: sticky; height: 100vh`), 248 px aberta e
  68 px fechada. Logo numa faixa de 72 px separada por uma linha; menu em grupos com legenda
  (Análise: Visão geral, Fila de alertas; Qualidade: Monitoramento; Dados: Fontes de dados); com a
  barra fechada, a legenda vira linha e cada item mostra uma dica escura com o nome ao passar o
  mouse ou focar. Embaixo, o perfil (avatar, nome, cargo) abre um menu com Configurações e Sair.
- **Barra superior** de 60 px, fixa: botão de recolher o menu, caminho ("Análise / Visão geral");
  à direita, Assistente (botão com texto), Aparência, notificações e conta.
- **Assistente**: painel à direita de 400 px, com contexto da tela, sugestões, mensagens, fontes
  citadas embaixo da resposta e o aviso "A IA auxilia a análise; a decisão é humana".
- **Notificações** no canto inferior direito, até 4 empilhadas: ponto do tipo, título, texto,
  botão ×, barra de 2 px que esvazia em 5 s, pausa com o mouse em cima, botão direito fecha.

## Conteúdo

- Página: `max-width: 1320px`, padding `36px clamp(16px, 3.5vw, 48px) 64px`, blocos com 36 px de
  distância. Cabeçalho: linha de contexto (13 px, muted) + título.
- **Card**: fundo `--card`, borda de 1 px, raio 14 px, padding `20px 22px`, sem sombra. Título 14 px
  peso 600 à esquerda e legenda 12 px muted à direita, na mesma linha.
- **Faixa de indicadores**: grade de células separadas por 1 px de borda (fundo da grade = borda),
  raio 14 px; cada célula com rótulo, número de 32 px e nota em mono 12 px; minilinha opcional.
- **Tabela**: cabeçalho 12 px muted peso 400, linhas com borda `--soft`, padding vertical 13 px,
  números à direita; nota de risco = número + barra de 72×4 px (`--signal` quando ≥ 98).
- **Gráficos** (Recharts): uma série por gráfico, nunca dois eixos; barra com raio de 4 px só no
  topo; semana atual em `--primary`, as outras em `--chart-muted`; linhas de grade em `--border`;
  rótulos em 11 px muted; valor no hover; título do gráfico diz o que é, sem legenda para série
  única.
- **Botões**: primário com fundo `--primary`, 40 px de altura, raio 8 px, peso 500; secundário com
  borda `--border` e fundo `--card`; ícone de 16–18 px com traço 1,5.
- **Campos**: 40–44 px, borda `--border`, raio 8–10 px, rótulo 13 px peso 500 acima.
- Ícones: lucide-react com `strokeWidth={1.5}`.

O código-fonte do protótipo fica fora do git; os arquivos que importam são estes tokens e regras.
