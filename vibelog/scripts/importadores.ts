import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import path from "node:path";
import type { areas, tipos } from "../src/features/registros/schemas/index";
export type Registro = {
  tipo: (typeof tipos)[number];
  area: (typeof areas)[number];
  autor: string;
  titulo: string;
  conteudo: string;
  origem_id?: string;
  origem?: string;
  pai?: string;
  destino?: string;
  modelo?: string;
  branch?: string;
  commit_sha?: string;
  criado_em?: string;
  meta?: Record<string, unknown>;
};
export function redigir(texto: string) {
  return texto
    .replace(/\b(?:sbp_|sb_secret_|sk-)[a-zA-Z0-9_.-]+/g, "[SEGREDO REMOVIDO]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[JWT REMOVIDO]")
    .replace(/(postgres(?:ql)?:\/\/[^\s:/@]+:)[^\s@]+@/gi, "$1[SENHA REMOVIDA]@")
    .replace(
      /((?:password|senha|api[_-]?key|access[_-]?token|refresh[_-]?token|SUPABASE_SECRET_KEY)\s*["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"',;}]+)/gi,
      (_texto, prefixo: string, valor: string) =>
        `${prefixo}${valor.startsWith('"') ? '"[SEGREDO REMOVIDO]"' : valor.startsWith("'") ? "'[SEGREDO REMOVIDO]'" : "[SEGREDO REMOVIDO]"}`,
    );
}
export function sanitizar<T>(valor: T): T {
  if (typeof valor === "string") return redigir(valor) as T;
  if (Array.isArray(valor)) return valor.map((item) => sanitizar(item)) as T;
  if (valor && typeof valor === "object")
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sanitizar(v)])) as T;
  return valor;
}
type Objeto = Record<string, unknown>;
function objeto(v: unknown): Objeto {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {};
}
function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  return v
    .map((x) => {
      const b = objeto(x);
      return ["text", "input_text", "output_text"].includes(String(b.type))
        ? String(b.text ?? "")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
function limpar(v: string) {
  return v.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}
function humano(v: string) {
  return (
    !!v &&
    !/^\s*(?:# AGENTS\.md instructions|<environment_context>|<system-reminder>|<local-command|<command-name>|\[Request interrupted)/.test(
      v,
    )
  );
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
export async function* lerTranscrito(
  arquivo: string,
  fonte: "claude" | "codex",
  area: Registro["area"] = "geral",
  autor?: string,
): AsyncGenerator<Registro> {
  const entrada = createReadStream(arquivo, { encoding: "utf8" });
  const linhas = createInterface({ input: entrada, crlfDelay: Infinity });
  let sessao = path.basename(arquivo, ".jsonl");
  let numero = 0;
  let pendente: Registro | null = null;
  let resposta: Registro | null = null;
  let anterior: string | undefined;
  try {
    for await (const linha of linhas) {
      numero++;
      if (!linha.trim()) continue;
      let x: Objeto;
      try {
        x = objeto(JSON.parse(linha));
      } catch {
        throw new Error(`JSONL inválido na linha ${numero}. Use somente linhas completas.`);
      }
      const p = objeto(x.payload);
      const m = objeto(x.message);
      if (fonte === "codex" && x.type === "session_meta") {
        sessao = String(p.session_id ?? p.id ?? sessao);
        continue;
      }
      let papel = "",
        conteudo = "",
        final = false;
      let uuid = String(x.uuid ?? x.id ?? p.id ?? "");
      if (fonte === "claude") {
        sessao = String(x.sessionId ?? sessao);
        if (x.isMeta || x.isSidechain) continue;
        if (x.type === "user" && m.role === "user") {
          papel = "user";
          conteudo = texto(m.content);
        }
        if (x.type === "assistant" && m.role === "assistant") {
          const blocos = Array.isArray(m.content) ? m.content : [];
          if (blocos.some((b) => objeto(b).type === "tool_use")) continue;
          papel = "assistant";
          conteudo = texto(m.content);
          final = true;
        }
      } else if (x.type === "response_item" && p.type === "message") {
        papel = String(p.role ?? "");
        conteudo = texto(p.content);
        final = papel === "assistant" && p.phase !== "commentary";
      } else if (x.type === "event_msg" && p.type === "task_complete" && p.last_agent_message) {
        papel = "assistant";
        conteudo = String(p.last_agent_message);
        final = true;
        uuid = String(p.turn_id ?? uuid);
      }
      conteudo = limpar(conteudo);
      if (!conteudo) continue;
      if (papel === "user" && humano(conteudo)) {
        if (pendente) {
          yield sanitizar(pendente);
          if (resposta) {
            yield sanitizar(resposta);
            anterior = resposta.origem_id;
          } else anterior = pendente.origem_id;
        }
        const id = `${fonte}:${sessao}:${uuid || hash(`${x.timestamp ?? ""}:${numero}:${conteudo}`)}`;
        pendente = {
          tipo: "prompt_humano",
          area,
          autor: autor ?? "pedro",
          titulo: conteudo
            .split("\n")
            .find(Boolean)!
            .replace(/^#+\s*/, "")
            .slice(0, 120),
          conteudo,
          origem_id: id,
          origem: arquivo,
          pai: anterior,
          meta: { fonte, sessao },
          ...(typeof x.timestamp === "string" ? { criado_em: x.timestamp } : {}),
        };
        resposta = null;
      } else if (papel === "assistant" && final && pendente) {
        const id = `${fonte}:${sessao}:${uuid || hash(`${x.timestamp ?? ""}:${numero}:${conteudo}`)}:resposta`;
        resposta = {
          tipo: "resposta",
          area,
          autor: fonte,
          titulo: `Resultado: ${pendente.titulo}`.slice(0, 140),
          conteudo,
          origem_id: id,
          origem: arquivo,
          pai: pendente.origem_id,
          modelo: typeof m.model === "string" ? m.model : undefined,
          meta: { fonte, sessao },
          ...(typeof x.timestamp === "string" ? { criado_em: x.timestamp } : {}),
        };
      }
    }
    if (pendente) {
      yield sanitizar(pendente);
      if (resposta) yield sanitizar(resposta);
    }
  } finally {
    linhas.close();
    entrada.destroy();
  }
}
