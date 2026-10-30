import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseSafeMarkdown } from "./markdown";
import { prepareEvidence } from "./evidence";
import { z } from "zod";
import { AREAS, NODE_TYPES } from "../src/features/records/schemas/index";
import { readTranscript, redact, sanitize, type RecordInput } from "./importers";
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const CLI_OPTIONS = [
  "type",
  "area",
  "author",
  "title",
  "parent",
  "target",
  "model",
  "branch",
  "commit",
  "source-id",
  "file",
  "node",
  "url",
  "caption",
  "theme",
];
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ...Object.fromEntries(CLI_OPTIONS.map((k) => [k, { type: "string" as const }])),
    "dry-run": { type: "boolean" },
    help: { type: "boolean" },
  },
});
const v: Record<string, string | boolean | undefined> = values;
const [cmd, targetArg] = positionals;
const dryRun = !!v["dry-run"];
let supabaseClient: SupabaseClient | undefined;
function sb() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key)
      throw new Error(
        "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em vibelog/.env.local.",
      );
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}
function requiredOption(flag: string) {
  const optVal = v[flag];
  if (typeof optVal !== "string" || !optVal.trim()) throw new Error(`Informe --${flag}.`);
  return optVal;
}
async function resolveParentId(parent?: string) {
  if (!parent) return null;
  if (z.uuid().safeParse(parent).success) return parent;
  const { data, error } = await sb()
    .from("vibelog_nos")
    .select("id")
    .eq("origem_id", parent)
    .single();
  if (error) throw new Error(`Pai não encontrado: ${parent}`);
  return String(data.id);
}
async function saveRecord(record: RecordInput) {
  const { parent, ...row } = sanitize(record);
  if (dryRun) {
    console.log(JSON.stringify({ action: "record", ...row, parent }));
    return row.origem_id ?? "dry-run";
  }
  const pai_id = await resolveParentId(parent);
  if (pai_id && row.origem_id) {
    const existing = await sb()
      .from("vibelog_nos")
      .select("id")
      .eq("origem_id", row.origem_id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const visited = new Set<string>();
    let current: string | null = pai_id;
    while (current) {
      if (current === existing.data?.id || visited.has(current))
        throw new Error("O pai informado criaria um ciclo na árvore.");
      visited.add(current);
      const ancestor: {
        data: { pai_id: string | null } | null;
        error: { message: string } | null;
      } = await sb().from("vibelog_nos").select("pai_id").eq("id", current).single();
      if (ancestor.error) throw ancestor.error;
      if (!ancestor.data) throw new Error("Ancestral não encontrado.");
      current = ancestor.data.pai_id;
    }
  }
  const payload = { ...row, pai_id };
  const q = row.origem_id
    ? sb().from("vibelog_nos").upsert(payload, { onConflict: "origem_id" })
    : sb().from("vibelog_nos").insert(payload);
  const { data, error } = await q.select("id").single();
  if (error) throw error;
  return String(data.id);
}
async function readInput() {
  if (v.file) return readFile(String(v.file), "utf8");
  if (process.stdin.isTTY)
    throw new Error("Informe --file ou envie o conteúdo pela entrada padrão.");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
async function attachEvidence(
  nodeId: string,
  evidenceType: string,
  filePath?: string,
  url?: string,
  caption?: string,
  buffer?: Buffer,
) {
  z.uuid().parse(nodeId);
  z.enum(["print", "commit", "log", "link", "arquivo"]).parse(evidenceType);
  if (!filePath && !url && !buffer) throw new Error("Informe --file ou --url.");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("A URL deve usar http ou https.");
  const lookup = await sb().from("vibelog_nos").select("id").eq("id", nodeId).single();
  if (lookup.error) throw new Error("Registro de destino não encontrado.");
  let storage_path: string | null = null;
  if (filePath || buffer) {
    const safeName = path.basename(filePath ?? "captura.png").replace(/[^\w.\-]/g, "_");
    storage_path = `${nodeId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
    const { bytes, mime } = prepareEvidence(
      filePath ?? "captura.png",
      buffer ?? (await readFile(filePath!)),
    );
    const { error } = await sb()
      .storage.from("vibelog-evidencias")
      .upload(storage_path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
  }
  const { data, error } = await sb()
    .from("vibelog_evidencias")
    .insert(
      sanitize({
        no_id: nodeId,
        tipo: evidenceType,
        storage_path,
        url: url ?? null,
        legenda: caption ?? null,
      }),
    )
    .select("id")
    .single();
  if (error) {
    if (storage_path) await sb().storage.from("vibelog-evidencias").remove([storage_path]);
    throw error;
  }
  console.log(data.id);
}
function rawField(header: string, fieldKey: string) {
  return new RegExp(`^${fieldKey}:\\s*([^\\r\\n]+)`, "m")
    .exec(header)?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, "");
}
async function importMarkdown(dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const records = new Map<string, RecordInput>();
  for (const file of files) {
    const sourcePath = path.join(dir, file);
    const raw = await readFile(sourcePath, "utf8");
    const { data, content, header } = parseSafeMarkdown(raw);
    const id = rawField(header, "id");
    if (!id) throw new Error(`Frontmatter sem id: ${file}`);
    const parentKey = rawField(header, "pai");
    const author = String(data.autor ?? "desconhecido");
    const recordType =
      data.tipo ??
      (/claude|codex|cursor|antigravity/i.test(author) ? "prompt_ia" : "prompt_humano");
    const isoDate = data.data ? new Date(data.data).toISOString() : undefined;
    if (records.has(`md:${id}`)) throw new Error(`ID Markdown duplicado: ${id}`);
    records.set(`md:${id}`, {
      tipo: z.enum(NODE_TYPES).parse(recordType),
      area: z.enum(AREAS).parse(data.area ?? "geral"),
      autor: author,
      destino: data.destino ? String(data.destino) : undefined,
      modelo: data.modelo ? String(data.modelo) : undefined,
      titulo:
        content
          .trim()
          .split("\n")
          .find(Boolean)
          ?.replace(/^#+\s*/, "")
          .slice(0, 140) ?? file,
      conteudo: content.trim(),
      origem_id: `md:${id}`,
      origem: sourcePath,
      parent: parentKey && parentKey !== "null" ? `md:${parentKey}` : undefined,
      criado_em: isoDate,
      meta: {
        repo: "TCS-Financial-Bootcamp-Team/fraudradar",
        ...(data.resultado ? { resultado: String(data.resultado) } : {}),
      },
    });
  }
  const sorted: RecordInput[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Ciclo nos pais: ${id}`);
    const item = records.get(id);
    if (!item) throw new Error(`Pai ausente nos Markdown: ${id}`);
    visiting.add(id);
    if (item.parent) visit(item.parent);
    visiting.delete(id);
    visited.add(id);
    sorted.push(item);
  }
  records.forEach((_, id) => visit(id));
  let count = 0;
  for (const n of sorted) {
    await saveRecord(n);
    count++;
  }
  console.log(`${count} nós ${dryRun ? "previstos (dry-run)" : "importados/atualizados"}.`);
}
async function main() {
  if (v.help || !cmd) {
    console.log(
      `VibeLog — registro de construção\n\nnode --type --area --author --title [--parent id|origem_id] [--target] [--model] [--branch] [--commit] [--source-id] (--file caminho | stdin)\nevidence --node id --type print|commit|log|link|arquivo (--file caminho | --url URL) [--caption]\nprint --node id --url http://localhost:3000/... [--theme light|dark] [--caption]\nimport-md diretório [--dry-run]\nimport-claude sessão.jsonl [--area geral] [--author pedro] [--dry-run]\nimport-codex sessão.jsonl [--area geral] [--author pedro] [--dry-run]`,
    );
    return;
  }
  if (cmd === "node") {
    const bodyText = await readInput();
    if (!bodyText.trim()) throw new Error("Conteúdo vazio.");
    console.log(
      await saveRecord({
        tipo: z.enum(NODE_TYPES).parse(requiredOption("type")),
        area: z.enum(AREAS).parse(requiredOption("area")),
        autor: requiredOption("author"),
        titulo: requiredOption("title"),
        conteudo: bodyText,
        origem: v.file as string | undefined,
        parent: v.parent as string | undefined,
        destino: v.target as string | undefined,
        modelo: v.model as string | undefined,
        branch: v.branch as string | undefined,
        commit_sha: v.commit as string | undefined,
        origem_id: v["source-id"] as string | undefined,
      }),
    );
    return;
  }
  if (cmd === "evidence") {
    if (dryRun) throw new Error("Use --dry-run apenas em nós e importadores.");
    if (v.file && v.url) throw new Error("Escolha --file ou --url.");
    await attachEvidence(
      requiredOption("node"),
      requiredOption("type"),
      v.file as string | undefined,
      v.url as string | undefined,
      v.caption as string | undefined,
    );
    return;
  }
  if (cmd === "print") {
    if (dryRun) throw new Error("Use --dry-run apenas em nós e importadores.");
    const url = new URL(requiredOption("url"));
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL inválida.");
    const colorTheme = z.enum(["light", "dark"]).parse(v.theme ?? "light");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        colorScheme: colorTheme,
      });
      await page.addInitScript((t) => {
        localStorage.setItem("theme", t);
      }, colorTheme);
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await attachEvidence(
        requiredOption("node"),
        "print",
        "captura.png",
        undefined,
        v.caption as string | undefined,
        await page.screenshot({ fullPage: true }),
      );
    } finally {
      await browser.close();
    }
    return;
  }
  if (cmd === "import-md") {
    if (!targetArg) throw new Error("Informe o diretório Markdown.");
    await importMarkdown(targetArg);
    return;
  }
  if (cmd === "import-claude" || cmd === "import-codex") {
    if (!targetArg) throw new Error("Informe a sessão JSONL.");
    let count = 0;
    for await (const n of readTranscript(
      targetArg,
      cmd === "import-claude" ? "claude" : "codex",
      z.enum(AREAS).parse(v.area ?? "geral"),
      v.author as string | undefined,
    )) {
      await saveRecord(n);
      count++;
    }
    console.log(`${count} nós ${dryRun ? "previstos (dry-run)" : "importados/atualizados"}.`);
    return;
  }
  throw new Error(`Comando desconhecido: ${cmd}. Use --help.`);
}
main().catch((e) => {
  const message =
    e instanceof z.ZodError
      ? "Parâmetros inválidos. Consulte --help."
      : e instanceof Error
        ? e.message
        : typeof e?.message === "string"
          ? e.message
          : "Falha na operação.";
  console.error(redact(message));
  process.exitCode = 1;
});
