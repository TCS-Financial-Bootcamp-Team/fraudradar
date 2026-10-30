# VibeLog

Aplicação independente para consultar a árvore de construção do FraudRadar.
Pessoas navegam; agentes registram prompts, delegações, resultados e evidências pela CLI.
Todas as alterações desta entrega ficam em `vibelog/`. Nenhuma migração é necessária.

## Executar no Windows

```powershell
cd C:\codigo\pessoal\fraudradar\vibelog
pnpm install
# Preencha .env.local a partir de .env.example, caso ainda não exista.
pnpm dev
```

Abra **http://localhost:3001**. A porta evita conflito com o frontend principal.
Entre com e-mail/senha de um usuário já existente no Supabase do FraudRadar.
Não há cadastro ou criação de usuários neste aplicativo.

```powershell
pnpm lint
pnpm test
pnpm build
pnpm start
```

Node 20.9+ é exigido pelo Next; a implementação foi validada com Node 24 e pnpm 10.
O lockfile fixa as versões. O TypeScript fica na série 5.9, compatível com o ESLint do Next.

## Explorar

- As oito áreas funcionam como filtros múltiplos; os cartões contam prompts humanos e de IA.
- Os autores têm contadores de prompts; resultados e marcos entram na contagem geral de registros.
- A árvore carrega filhos ao expandir. Um índice paginado de IDs, pais e metadados permite
  calcular contagens e manter ancestrais de outras áreas quando um descendente corresponde.
- Busca insensível a maiúsculas em **título e conteúdo**, combinada com autor, tipo, branch e datas.
  Usa `ILIKE` sobre o esquema existente: não depende de índice ou função SQL adicional.
  Para um acervo grande, o próximo passo é validar uma busca indexada com o time de dados.
- Datas são dias UTC, com início e fim inclusivos. Os detalhes exibem o fuso explicitamente.
- Filtros, seleção, visualização e modo apresentação ficam na URL e podem ser compartilhados.
- Os detalhes incluem Markdown com código destacado, caminho até a raiz e evidências.
- `meta.repo` aceita `organizacao/repositorio` ou sua URL GitHub para links de branch/commit.
- Temas claro/escuro seguem o sistema e podem ser alternados. O modo apresentação aumenta a leitura.

## Segurança e arquitetura

`componente → hook → service → /api/records → Supabase`.
Componentes não fazem fetch. Zod valida entradas e linhas retornadas. Erros aparecem via toast,
com estados de erro e tentativa de recarga. HTML embutido e imagens remotas no Markdown não
são executados/carregados; imagens devem ser anexadas como evidências.

O viewer usa **somente a chave pública**, tanto no navegador como no servidor, com cookies
`@supabase/ssr`, renovação no proxy e checagem de usuário nas páginas e em toda consulta.
O cookie tem nome próprio (`vibelog-auth`) para não colidir com o app principal em localhost.
A API oferece somente GET. RLS continua responsável por autorizar leitura no banco e no bucket.
Não há formulário de edição, endpoint de escrita ou referência à chave secreta em `src/`.

Somente `scripts/vibelog.ts` usa `SUPABASE_SECRET_KEY`. Não distribua `.env.local` aos leitores.
Os três nomes de variável estão em `.env.example`, sem valores.
Evidências privadas recebem URLs assinadas de uma hora; **Atualizar links** renova os links.
URLs assinadas devem ser tratadas como acesso temporário: não publique capturas contendo essas URLs.

## CLI dos agentes

Instruções rápidas e exemplos de registro: [AGENTS.md](AGENTS.md).

```powershell
pnpm vibelog --help
pnpm vibelog import-md ../docs/vibe-coding/prompts
pnpm vibelog import-claude C:\caminho\sessao.jsonl --area backend --dry-run
pnpm vibelog import-codex C:\caminho\sessao.jsonl --area ml --dry-run
pnpm exec playwright install chromium
```

`node` recebe o conteúdo via `--file` ou entrada padrão. `--parent` aceita UUID ou uma chave
`origem_id`. `--source-id` faz upsert e preserva a identidade. Markdown usa `md:<id>`, ordena
pais antes dos filhos e rejeita IDs duplicados, pais ausentes e ciclos antes de gravar.
IDs como `001` preservam seus zeros. `area` ausente vira `geral`; o tipo é inferido pelo autor,
com suporte a `tipo` explícito no frontmatter.

Importadores JSONL leem em fluxo, ignoram ferramentas/lembretes e registram o prompt humano
e a última resposta textual do assistente em cada turno. O prompt seguinte se liga ao resultado
anterior, quando existe. Chaves estáveis por fonte/sessão/mensagem permitem repetir o mesmo
arquivo sem duplicação. `--dry-run` não instancia cliente Supabase nem faz upload.
Claude usa o UUID da mensagem; Codex usa o identificador disponível ou um hash estável de
timestamp, posição da linha e conteúdo. Não recorte/reordene um arquivo entre importações reais.

Textos passam por redação de tokens `sbp_`, `sb_secret_`, `sk-`, JWTs, senhas de URLs Postgres
e atribuições comuns de credenciais. O filtro não substitui revisão humana de conteúdo e imagens.
Use uma cópia revisada quando uma sessão contiver informação sensível fora desses padrões.
Uma importação interrompida pode ser repetida para terminar os registros pendentes.

`evidence` envia o arquivo antes de inserir o vínculo e remove o upload se a inserção falhar.
`print` abre Chromium em sessão nova, escolhe o tema e captura a página inteira. Uma tela
protegida pode mostrar o login; para sessões autenticadas, anexe uma captura revisada via `evidence`.

## Verificação no navegador

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

O teste sobe um servidor Supabase **fictício local** na porta 4011 e um Next isolado na porta 3002.
Não usa usuários nem dados reais. Verifica login, proteção da API, filhos sob demanda, filtros
com ancestrais, detalhes, código, imagens assinadas/lightbox, temas, apresentação, linha do tempo,
busca, viewport mobile e logout. Falha se o viewer tentar escrever nas tabelas.
Capturas são salvas em `test-results/` (ignorado pelo Git). Login com credenciais reais da equipe
e políticas RLS devem ser conferidos no ambiente de apresentação.

## Decisões para o responsável pelo produto validar

1. Datas por dia UTC e contadores de prompts globais, sem mudar com os filtros.
2. Classificação por uma área predominante por nó; trabalhos mistos são divididos em filhos.
3. Acesso apenas para os usuários existentes; sem cadastro, edição ou compartilhamento público.
4. Markdown como fonte inicial; importação de sessões é optativa, revisada e feita pelos agentes.
5. Capturas autenticadas são anexadas explicitamente; não se reutiliza a sessão pessoal do navegador.
