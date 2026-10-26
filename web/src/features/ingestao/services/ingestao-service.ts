import Papa from "papaparse";
import { apiGet, apiMultipart, apiPost, USA_MOCKS } from "@/lib/api";
import {
  cabecalhosCsv,
  conexaoSchema,
  fontesSchema,
  fonteSchema,
  reciboSchema,
  transacaoSchema,
  type Conexao,
  type Previa,
  type Transacao,
} from "../schemas/ingestao";

export function validarCabecalhos(campos: string[]) {
  const faltando = cabecalhosCsv.filter((c) => !campos.includes(c));
  const extras = campos.filter((c) => !cabecalhosCsv.includes(c));
  if (
    faltando.length ||
    extras.length ||
    campos.length !== cabecalhosCsv.length
  )
    throw new Error(
      "O CSV deve conter exatamente as 11 colunas transacionais SAML-D. Faltando: " +
        (faltando.join(", ") || "nenhuma") +
        ". Remova colunas extras ou duplicadas.",
    );
}
export function prepararPrevia(
  arquivo: File,
  signal?: AbortSignal,
): Promise<Previa> {
  if (!arquivo.name.toLowerCase().endsWith(".csv") || !arquivo.size)
    return Promise.reject(new Error("Selecione um arquivo CSV não vazio."));
  return new Promise((resolve, reject) => {
    let parserAtivo: Papa.Parser | undefined;
    let campos: string[] = [];
    const linhas: Record<string, string>[] = [];
    let blocos = 0;
    const concluir = () => {
      signal?.removeEventListener("abort", abortar);
      if (!linhas.length) {
        reject(new Error("O CSV não contém transações."));
        return;
      }
      resolve({
        cabecalhos: campos,
        linhas: linhas.slice(0, 20),
        arquivo: arquivo.name,
      });
    };
    const abortar = () => {
      parserAtivo?.abort();
      reject(new DOMException("Prévia cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", abortar, { once: true });
    Papa.parse<Record<string, string>>(arquivo, {
      header: true,
      preview: 20,
      skipEmptyLines: "greedy",
      chunkSize: 64 * 1024,
      beforeFirstChunk: (trecho) => {
        if (!trecho.includes("\n") && arquivo.size > 64 * 1024) {
          reject(new Error("Cabeçalho inválido ou excessivamente longo."));
          return "";
        }
        return trecho.replace(/^\uFEFF/, "");
      },
      chunk: (resultado, parser) => {
        parserAtivo = parser;
        if (signal?.aborted) {
          parser.abort();
          return;
        }
        try {
          if (++blocos > 16)
            throw new Error(
              "Linhas excessivamente longas. Revise o formato do CSV.",
            );
          if (resultado.errors.length)
            throw new Error(
              "CSV inválido: verifique delimitadores, aspas e colunas.",
            );
          campos = resultado.meta.fields ?? [];
          validarCabecalhos(campos);
          for (const [indice, linha] of resultado.data.entries()) {
            const validacao = transacaoSchema.safeParse({
              ...linha,
              Amount: Number(linha.Amount),
            });
            if (!validacao.success)
              throw new Error(
                "Linha " +
                  (indice + 2) +
                  ": " +
                  validacao.error.issues[0].message,
              );
          }
          linhas.push(...resultado.data);
          if (linhas.length >= 20) {
            concluir();
            parser.abort();
          }
        } catch (erro) {
          signal?.removeEventListener("abort", abortar);
          reject(erro);
          parser.abort();
        }
      },
      complete: concluir,
      error: () => {
        signal?.removeEventListener("abort", abortar);
        reject(new Error("Não foi possível ler o CSV."));
      },
    });
  });
}
function exigirTransporteSeguro() {
  const url = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(
      "Credenciais de conexão exigem uma API HTTPS. HTTP é permitido apenas em localhost.",
    );
}
export async function enviarCsv(
  arquivo: File,
  progresso: (valor: number) => void,
  signal?: AbortSignal,
) {
  if (USA_MOCKS) {
    progresso(100);
    return reciboSchema.parse(
      (await import("./mocks")).reciboMock(
        "Arquivo recebido em demonstração. Nenhum dado foi importado na API.",
      ),
    );
  }
  const dados = new FormData();
  dados.set("arquivo", arquivo);
  return reciboSchema.parse(
    await apiMultipart("/ingestao/csv", dados, progresso, signal),
  );
}
export async function enviarTransacao(dados: Transacao) {
  const d = transacaoSchema.parse(dados);
  return reciboSchema.parse(
    USA_MOCKS
      ? (await import("./mocks")).reciboMock(
          "Transação registrada em demonstração.",
        )
      : await apiPost("/ingestao/transacoes", d),
  );
}
export async function listarFontes(signal?: AbortSignal) {
  return fontesSchema.parse(
    USA_MOCKS
      ? { itens: (await import("./mocks")).fontesMock }
      : await apiGet("/ingestao/conexoes", { signal }),
  );
}
export async function registrarFonte(dados: Conexao) {
  const d = conexaoSchema.parse(dados);
  if (USA_MOCKS) {
    const m = await import("./mocks");
    const u = new URL(d.connection_string);
    const fonte = fonteSchema.parse({
      id: crypto.randomUUID(),
      nome: d.nome,
      tipo: "postgres",
      host_mascarado: u.hostname.slice(0, 3) + "•••",
      banco_mascarado: u.pathname.slice(1, 4) + "•••",
      status: "conectada",
      ultima_sincronizacao: null,
    });
    m.fontesMock.push(fonte);
    return fonte;
  }
  exigirTransporteSeguro();
  return fonteSchema.parse(await apiPost("/ingestao/conexoes", d));
}
export async function sincronizarFonte(id: string) {
  if (USA_MOCKS) {
    const m = await import("./mocks");
    const fonte = m.fontesMock.find((f) => f.id === id);
    if (!fonte) throw new Error("Fonte não encontrada.");
    fonte.ultima_sincronizacao = new Date().toISOString();
    fonte.status = "conectada";
    return fonteSchema.parse(fonte);
  }
  return fonteSchema.parse(
    await apiPost(
      "/ingestao/conexoes/" + encodeURIComponent(id) + "/sincronizar",
      {},
    ),
  );
}
