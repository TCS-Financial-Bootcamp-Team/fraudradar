"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database, FileUp, Plus, RefreshCw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campo";
import { Carregando, ErroRecurso, Vazio } from "@/components/ui/estados";
import { dataCurta } from "@/lib/formatacao";
import { useCsv, useFontes, useTransacao } from "../hooks/use-ingestao";
import {
  cabecalhosCsv,
  conexaoSchema,
  meios,
  moedas,
  paises,
  transacaoSchema,
  type Conexao,
  type Transacao,
} from "../schemas/ingestao";

function Csv() {
  const r = useCsv();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-6">
      <section className="panel p-6">
        <h2 className="mb-2 font-semibold">Importar transações</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Escolha um CSV no formato SAML-D. A prévia lê até 20 linhas; a API
          valida o arquivo completo.
        </p>
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center sm:p-12"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!r.ocupado && e.dataTransfer.files[0])
              void r.selecionar(e.dataTransfer.files[0]);
          }}
        >
          <UploadCloud className="mx-auto mb-4 size-10 text-primary" />
          <h3 className="font-medium">Arraste seu arquivo CSV até aqui</h3>
          <p className="mb-5 mt-2 text-xs text-muted-foreground">
            ou selecione um arquivo do seu computador
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivo CSV"
            disabled={r.ocupado}
            onChange={(e) => {
              if (e.target.files?.[0]) void r.selecionar(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <Button
            disabled={r.ocupado}
            variant="outline"
            onClick={() => input.current?.click()}
          >
            <FileUp />
            Selecionar CSV
          </Button>
        </div>
        <details className="mt-5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Ver as 11 colunas obrigatórias
          </summary>
          <p className="mt-3 break-words font-mono leading-loose">
            {cabecalhosCsv.join(", ")}
          </p>
        </details>
        {r.lendo && (
          <p className="mt-4 text-sm" role="status">
            Validando a prévia…
          </p>
        )}
        {r.erro && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {r.erro}
          </p>
        )}
      </section>
      {r.previa && (
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2 className="truncate">Prévia · {r.previa.arquivo}</h2>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {r.previa.linhas.length} linhas
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {r.previa.cabecalhos.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.previa.linhas.map((l, i) => (
                  <tr key={i}>
                    {r.previa?.cabecalhos.map((c) => (
                      <td key={c}>
                        {c.endsWith("_account")
                          ? "••••" + l[c].slice(-4)
                          : l[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t p-6">
            <p className="text-xs text-muted-foreground">
              A validação local cobre apenas esta amostra. A API deve rejeitar
              linhas inválidas e colunas não permitidas em todo o arquivo.
            </p>
            {(r.ocupado || r.concluido) && (
              <div>
                <label className="mb-2 block text-xs" htmlFor="progresso-csv">
                  {r.concluido
                    ? "Recebimento confirmado"
                    : r.progresso === 100
                      ? "Arquivo enviado. Aguardando confirmação…"
                      : "Enviando arquivo… " + r.progresso + "%"}
                </label>
                <progress
                  className="h-2 w-full accent-primary"
                  id="progresso-csv"
                  max={100}
                  value={r.progresso}
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button
                disabled={r.ocupado || r.concluido || r.lendo}
                onClick={() => void r.enviar()}
              >
                <UploadCloud />
                {r.ocupado
                  ? "Enviando…"
                  : r.concluido
                    ? "Arquivo recebido"
                    : "Enviar arquivo para ingestão"}
              </Button>
              {r.ocupado && (
                <Button variant="outline" onClick={r.cancelar}>
                  Cancelar envio
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
function Conexoes() {
  const r = useFontes();
  const [modo, setModo] = useState("uri");
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  async function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    const form = e.currentTarget;
    const d = new FormData(form);
    let uri = String(d.get("uri") ?? "");
    if (modo === "campos") {
      const porta = String(d.get("porta"));
      if (!/^\d+$/.test(porta) || Number(porta) < 1 || Number(porta) > 65535) {
        setErro("Informe uma porta entre 1 e 65535.");
        return;
      }
      uri =
        "postgresql://" +
        encodeURIComponent(String(d.get("usuario"))) +
        ":" +
        encodeURIComponent(String(d.get("senha"))) +
        "@" +
        String(d.get("host")).trim() +
        ":" +
        porta +
        "/" +
        encodeURIComponent(String(d.get("banco")));
    }
    const dados: Conexao = {
      nome: String(d.get("nome")),
      tipo: "postgres",
      connection_string: uri,
      ssl: d.get("ssl") === "on",
    };
    const validacao = conexaoSchema.safeParse(dados);
    if (!validacao.success) {
      setErro(validacao.error.issues[0].message);
      return;
    }
    // Credenciais não são guardadas no estado nem no armazenamento do navegador.
    try {
      if (await r.registrar(validacao.data)) form.reset();
    } finally {
      for (const nome of ["uri", "senha"]) {
        const campo = form.elements.namedItem(nome);
        if (campo instanceof HTMLInputElement) campo.value = "";
      }
      uri = "";
      dados.connection_string = "";
    }
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="panel">
        <h2 className="panel-title">Cadastrar fonte Postgres</h2>
        <form
          ref={ref}
          onSubmit={registrar}
          className="grid gap-5 p-6"
          autoComplete="off"
        >
          <Campo nome="Nome da fonte">
            <Input
              name="nome"
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex.: Operações de produção"
            />
          </Campo>
          <Campo nome="Tipo de banco">
            <Select name="tipo">
              <option>Postgres</option>
            </Select>
          </Campo>
          <Campo nome="Como deseja conectar?">
            <Select value={modo} onChange={(e) => setModo(e.target.value)}>
              <option value="uri">Connection string</option>
              <option value="campos">Host, porta e credenciais</option>
            </Select>
          </Campo>
          {modo === "uri" ? (
            <Campo nome="Connection string">
              <Input
                type="password"
                name="uri"
                autoComplete="new-password"
                required
                placeholder="postgresql://usuario:senha@host:5432/banco"
              />
            </Campo>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                <Campo nome="Host">
                  <Input name="host" required placeholder="db.exemplo.com" />
                </Campo>
                <Campo nome="Porta">
                  <Input
                    name="porta"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={5432}
                    required
                  />
                </Campo>
              </div>
              <Campo nome="Banco de dados">
                <Input name="banco" required />
              </Campo>
              <Campo nome="Usuário">
                <Input name="usuario" autoComplete="off" required />
              </Campo>
              <Campo nome="Senha">
                <Input
                  name="senha"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </Campo>
            </>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              name="ssl"
              defaultChecked
            />
            Exigir conexão SSL
          </label>
          <p className="notice text-xs">
            As credenciais são enviadas uma única vez para a API via HTTPS. Após
            o cadastro, apenas host e banco mascarados são exibidos. Use um
            usuário de banco com acesso somente de leitura.
          </p>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <Button type="submit" disabled={r.ocupado}>
            <Database />
            {r.ocupado ? "Registrando…" : "Registrar fonte"}
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2 className="panel-title">Fontes registradas</h2>
        {r.carregando ? (
          <div className="p-6">
            <Carregando />
          </div>
        ) : r.erro ? (
          <ErroRecurso mensagem={r.erro} tentar={r.recarregar} />
        ) : !r.dados?.itens.length ? (
          <Vazio
            titulo="Nenhuma fonte cadastrada"
            descricao="Cadastre um banco Postgres para iniciar a ingestão."
          />
        ) : (
          <div className="divide-y px-6">
            {r.dados.itens.map((f) => (
              <article key={f.id} className="grid gap-3 py-5">
                <div className="flex justify-between gap-3">
                  <h3 className="text-sm font-semibold">{f.nome}</h3>
                  <span
                    className={`text-xs ${f.status === "erro" ? "text-destructive" : "text-primary"}`}
                  >
                    {f.status === "conectada"
                      ? "Conectada"
                      : f.status === "erro"
                        ? "Falha de conexão"
                        : "Sincronizando"}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {f.host_mascarado} / {f.banco_mascarado}
                </p>
                <p className="text-xs text-muted-foreground">
                  Última sincronização:{" "}
                  {f.ultima_sincronizacao
                    ? dataCurta(f.ultima_sincronizacao)
                    : "ainda não realizada"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={r.ocupado || f.status === "sincronizando"}
                  onClick={() => void r.sincronizar(f.id)}
                >
                  <RefreshCw />
                  Sincronizar
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
const nomes: Record<keyof Transacao, string> = {
  Date: "Data",
  Time: "Horário",
  Sender_account: "Conta de origem",
  Receiver_account: "Conta de destino",
  Amount: "Valor",
  Payment_currency: "Moeda do pagamento",
  Received_currency: "Moeda do recebimento",
  Sender_bank_location: "País do banco de origem",
  Receiver_bank_location: "País do banco de destino",
  Payment_type: "Meio de pagamento",
};
function Manual() {
  const r = useTransacao();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Transacao>({
    resolver: zodResolver(transacaoSchema),
    defaultValues: {
      Payment_currency: "BRL",
      Received_currency: "BRL",
      Time: "12:00:00",
    },
  });
  return (
    <div className="grid gap-6">
      <section className="panel">
        <h2 className="panel-title">Adicionar uma transação</h2>
        <form
          className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={handleSubmit(async (d) => {
            if (await r.enviar(d)) reset();
          })}
        >
          {(Object.keys(nomes) as Array<keyof Transacao>).map((chave) => (
            <Campo
              key={chave}
              nome={nomes[chave]}
              erro={errors[chave]?.message}
            >
              <Input
                {...register(
                  chave,
                  chave === "Amount" ? { valueAsNumber: true } : {},
                )}
                type={
                  chave === "Date"
                    ? "date"
                    : chave === "Time"
                      ? "time"
                      : chave === "Amount"
                        ? "number"
                        : "text"
                }
                step={
                  chave === "Amount"
                    ? "0.01"
                    : chave === "Time"
                      ? "1"
                      : undefined
                }
                min={chave === "Amount" ? "0.01" : undefined}
                list={
                  chave.includes("currency")
                    ? "moedas"
                    : chave.includes("location")
                      ? "paises"
                      : chave === "Payment_type"
                        ? "meios"
                        : undefined
                }
                placeholder={
                  chave.includes("currency") ||
                  chave.includes("location") ||
                  chave === "Payment_type"
                    ? "Digite para buscar…"
                    : undefined
                }
                autoComplete="off"
              />
            </Campo>
          ))}
          <datalist id="moedas">
            {moedas.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <datalist id="paises">
            {paises.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="meios">
            {meios.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={r.ocupado}>
              <Plus />
              {r.ocupado ? "Registrando…" : "Registrar transação"}
            </Button>
          </div>
        </form>
      </section>
      <section className="panel overflow-hidden">
        <h2 className="panel-title">
          Registros desta sessão · {r.entradas.length}
        </h2>
        {!r.entradas.length ? (
          <Vazio
            titulo="Nenhuma transação registrada"
            descricao="Os registros enviados por este formulário aparecerão aqui durante a sessão."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.entradas.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono">{e.origem}</td>
                    <td className="font-mono">{e.destino}</td>
                    <td>
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: e.moeda,
                      }).format(e.valor)}
                    </td>
                    <td>Recebido</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
export function Ingestao() {
  const [aba, setAba] = useState("csv");
  const abas = [
    { id: "csv", nome: "Upload de CSV", icone: FileUp },
    { id: "conexoes", nome: "Conexão com banco", icone: Database },
    { id: "manual", nome: "Formulário manual", icone: Plus },
  ];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Entrada de operações</p>
          <h1>Fontes de dados</h1>
          <p>
            Conecte suas operações ao monitoramento com controle e visibilidade.
          </p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Método de ingestão"
        className="flex overflow-x-auto border-b"
      >
        {abas.map(({ id, nome, icone: Icone }, i) => (
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            key={id}
            id={"aba-" + id}
            role="tab"
            aria-controls={"painel-" + id}
            aria-selected={aba === id}
            tabIndex={aba === id ? 0 : -1}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const proxima =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 2
                    : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
              setAba(abas[proxima].id);
              refs.current[proxima]?.focus();
            }}
            onClick={() => setAba(id)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-xs font-medium ${aba === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            <Icone className="size-4" />
            {nome}
          </button>
        ))}
      </div>
      {abas.map(({ id }) => (
        <div
          key={id}
          id={"painel-" + id}
          role="tabpanel"
          aria-labelledby={"aba-" + id}
          hidden={aba !== id}
        >
          {id === "csv" ? (
            <Csv />
          ) : id === "conexoes" ? (
            <Conexoes />
          ) : (
            <Manual />
          )}
        </div>
      ))}
    </>
  );
}
