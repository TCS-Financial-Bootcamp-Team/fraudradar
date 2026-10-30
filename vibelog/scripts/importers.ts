import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AREAS, NODE_TYPES } from "../src/features/records/schemas/index";
export type RecordInput = {
  tipo: (typeof NODE_TYPES)[number];
  area: (typeof AREAS)[number];
  autor: string;
  titulo: string;
  conteudo: string;
  origem_id?: string;
  origem?: string;
  parent?: string;
  destino?: string;
  modelo?: string;
  branch?: string;
  commit_sha?: string;
  criado_em?: string;
  meta?: Record<string, unknown>;
};
export function redact(text: string) {
  return text
    .replace(
      /(\b(?:proxy-)?authorization["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)/gi,
      (_match, prefix: string, value: string) =>
        `${prefix}${value.startsWith('"') ? '"[AUTORIZAÇÃO REMOVIDA]"' : value.startsWith("'") ? "'[AUTORIZAÇÃO REMOVIDA]'" : "[AUTORIZAÇÃO REMOVIDA]"}`,
    )
    .replace(/\b(?:sbp_|sb_secret_|sk-)[a-zA-Z0-9_.-]+/g, "[SEGREDO REMOVIDO]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[JWT REMOVIDO]")
    .replace(/(postgres(?:ql)?:\/\/[^\s:/@]*:)[^\s@]+@/gi, "$1[SENHA REMOVIDA]@")
    .replace(
      /((?:password|senha|api[_-]?key|access[_-]?token|refresh[_-]?token|SUPABASE_SECRET_KEY)\s*["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"',;}]+)/gi,
      (_match, prefix: string, value: string) =>
        `${prefix}${value.startsWith('"') ? '"[SEGREDO REMOVIDO]"' : value.startsWith("'") ? "'[SEGREDO REMOVIDO]'" : "[SEGREDO REMOVIDO]"}`,
    );
}
export function sanitize<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitize(item)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(?:proxy-)?authorization$/i.test(k) ? "[AUTORIZAÇÃO REMOVIDA]" : sanitize(v),
      ]),
    ) as T;
  return value;
}
type JsonObject = Record<string, unknown>;
function asObject(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
}
function extractText(v: unknown): string {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  return v
    .map((x) => {
      const b = asObject(x);
      return ["text", "input_text", "output_text"].includes(String(b.type))
        ? String(b.text ?? "")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
function cleanText(v: string) {
  return v.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}
function isHumanPrompt(v: string) {
  return (
    !!v &&
    !/^\s*(?:# AGENTS\.md instructions|<environment_context>|<system-reminder>|<local-command|<command-name>|\[Request interrupted)/.test(
      v,
    )
  );
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
export async function* readTranscript(
  filePath: string,
  source: "claude" | "codex",
  area: RecordInput["area"] = "geral",
  author?: string,
): AsyncGenerator<RecordInput> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let session = path.basename(filePath, ".jsonl");
  let lineNumber = 0;
  let pending: RecordInput | null = null;
  let reply: RecordInput | null = null;
  let previous: string | undefined;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      let x: JsonObject;
      try {
        x = asObject(JSON.parse(line));
      } catch {
        throw new Error(`JSONL inválido na linha ${lineNumber}. Use somente linhas completas.`);
      }
      const p = asObject(x.payload);
      const m = asObject(x.message);
      if (source === "codex" && x.type === "session_meta") {
        session = String(p.session_id ?? p.id ?? session);
        continue;
      }
      let role = "",
        textContent = "",
        isFinal = false;
      const uuid = String(x.uuid ?? x.id ?? p.id ?? "");
      if (source === "claude") {
        session = String(x.sessionId ?? session);
        if (x.isMeta || x.isSidechain) continue;
        if (x.type === "user" && m.role === "user") {
          role = "user";
          textContent = extractText(m.content);
        }
        if (x.type === "assistant" && m.role === "assistant") {
          const blocks = Array.isArray(m.content) ? m.content : [];
          if (blocks.some((b) => asObject(b).type === "tool_use")) continue;
          role = "assistant";
          textContent = extractText(m.content);
          isFinal = true;
        }
      } else if (x.type === "response_item" && p.type === "message") {
        role = String(p.role ?? "");
        textContent = extractText(p.content);
        isFinal = role === "assistant" && p.phase !== "commentary";
      } else if (x.type === "event_msg" && p.type === "task_complete" && p.last_agent_message) {
        role = "assistant";
        textContent = String(p.last_agent_message);
        isFinal = true;
      }
      textContent = cleanText(textContent);
      if (!textContent) continue;
      if (role === "user" && isHumanPrompt(textContent)) {
        if (pending) {
          yield sanitize(pending);
          if (reply) {
            yield sanitize(reply);
            previous = reply.origem_id;
          } else previous = pending.origem_id;
        }
        const id = `${source}:${session}:${uuid || hash(`${x.timestamp ?? ""}:${lineNumber}:${textContent}`)}`;
        pending = {
          tipo: "prompt_humano",
          area,
          autor: author ?? "pedro",
          titulo: textContent
            .split("\n")
            .find(Boolean)!
            .replace(/^#+\s*/, "")
            .slice(0, 120),
          conteudo: textContent,
          origem_id: id,
          origem: filePath,
          parent: previous,
          meta: { fonte: source, sessao: session },
          ...(typeof x.timestamp === "string" ? { criado_em: x.timestamp } : {}),
        };
        reply = null;
      } else if (role === "assistant" && isFinal && pending) {
        const id: string = `${pending.origem_id}:resposta`;
        reply = {
          tipo: "resposta",
          area,
          autor: source,
          titulo: `Resultado: ${pending.titulo}`.slice(0, 140),
          conteudo: textContent,
          origem_id: id,
          origem: filePath,
          parent: pending.origem_id,
          modelo: typeof m.model === "string" ? m.model : undefined,
          meta: { fonte: source, sessao: session },
          ...(typeof x.timestamp === "string" ? { criado_em: x.timestamp } : {}),
        };
      }
    }
    if (pending) {
      yield sanitize(pending);
      if (reply) yield sanitize(reply);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}
