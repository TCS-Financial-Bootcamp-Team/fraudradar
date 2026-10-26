import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import matter from "gray-matter";
import { z } from "zod";
import { areas, tipos } from "../src/features/registros/schemas/index";
import { lerTranscrito, redigir, sanitizar, type Registro } from "./importadores";
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const opcoes = [
  "tipo",
  "area",
  "autor",
  "titulo",
  "pai",
  "destino",
  "modelo",
  "branch",
  "commit",
  "origem-id",
  "arquivo",
  "no",
  "url",
  "legenda",
  "tema",
];
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ...Object.fromEntries(opcoes.map((k) => [k, { type: "string" as const }])),
    "dry-run": { type: "boolean" },
    help: { type: "boolean" },
  },
});
const v: Record<string, string | boolean | undefined> = values;
const [cmd, alvo] = positionals;
const seco = !!v["dry-run"];
let cliente: SupabaseClient | undefined;
function sb() {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key)
      throw new Error(
        "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em vibelog/.env.local.",
      );
    cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cliente;
}
function requerido(nome: string) {
  const valor = v[nome];
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Informe --${nome}.`);
  return valor;
}
async function paiId(pai?: string) {
  if (!pai) return null;
  if (z.uuid().safeParse(pai).success) return pai;
  const { data, error } = await sb().from("vibelog_nos").select("id").eq("origem_id", pai).single();
  if (error) throw new Error(`Pai não encontrado: ${pai}`);
  return String(data.id);
}
async function gravar(registro: Registro) {
  const { pai, ...dados } = sanitizar(registro);
  if (seco) {
    console.log(JSON.stringify({ acao: "registrar", ...dados, pai }));
    return dados.origem_id ?? "dry-run";
  }
  const pai_id = await paiId(pai);
  if (pai_id && dados.origem_id) {
    const existente = await sb()
      .from("vibelog_nos")
      .select("id")
      .eq("origem_id", dados.origem_id)
      .maybeSingle();
    if (existente.error) throw existente.error;
    const visitados = new Set<string>();
    let atual: string | null = pai_id;
    while (atual) {
      if (atual === existente.data?.id || visitados.has(atual))
        throw new Error("O pai informado criaria um ciclo na árvore.");
      visitados.add(atual);
      const ancestral: {
        data: { pai_id: string | null } | null;
        error: { message: string } | null;
      } = await sb().from("vibelog_nos").select("pai_id").eq("id", atual).single();
      if (ancestral.error) throw ancestral.error;
      if (!ancestral.data) throw new Error("Ancestral não encontrado.");
      atual = ancestral.data.pai_id;
    }
  }
  const payload = { ...dados, pai_id };
  const q = dados.origem_id
    ? sb().from("vibelog_nos").upsert(payload, { onConflict: "origem_id" })
    : sb().from("vibelog_nos").insert(payload);
  const { data, error } = await q.select("id").single();
  if (error) throw error;
  return String(data.id);
}
async function lerEntrada() {
  if (v.arquivo) return readFile(String(v.arquivo), "utf8");
  if (process.stdin.isTTY)
    throw new Error("Informe --arquivo ou envie o conteúdo pela entrada padrão.");
  const partes: Buffer[] = [];
  for await (const chunk of process.stdin) partes.push(Buffer.from(chunk));
  return Buffer.concat(partes).toString("utf8");
}
async function evidencia(
  no: string,
  tipo: string,
  arquivo?: string,
  url?: string,
  legenda?: string,
  buffer?: Buffer,
) {
  z.uuid().parse(no);
  z.enum(["print", "commit", "log", "link", "arquivo"]).parse(tipo);
  if (!arquivo && !url && !buffer) throw new Error("Informe --arquivo ou --url.");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("A URL deve usar http ou https.");
  const identificacao = await sb().from("vibelog_nos").select("id").eq("id", no).single();
  if (identificacao.error) throw new Error("Registro de destino não encontrado.");
  let storage_path: string | null = null;
  if (arquivo || buffer) {
    const nome = path.basename(arquivo ?? "captura.png").replace(/[^\w.\-]/g, "_");
    storage_path = `${no}/${Date.now()}-${randomUUID().slice(0, 8)}-${nome}`;
    let bytes = buffer ?? (await readFile(arquivo!));
    const ext = path.extname(nome).toLowerCase();
    const textual = [
      ".log",
      ".txt",
      ".md",
      ".json",
      ".jsonl",
      ".csv",
      ".yaml",
      ".yml",
      ".sql",
      ".ts",
      ".js",
      ".py",
    ].includes(ext);
    if (textual) bytes = Buffer.from(redigir(bytes.toString("utf8")));
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : [".jpg", ".jpeg"].includes(ext)
            ? "image/jpeg"
            : textual
              ? "text/plain; charset=utf-8"
              : "application/octet-stream";
    const { error } = await sb()
      .storage.from("vibelog-evidencias")
      .upload(storage_path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
  }
  const { data, error } = await sb()
    .from("vibelog_evidencias")
    .insert(
      sanitizar({ no_id: no, tipo, storage_path, url: url ?? null, legenda: legenda ?? null }),
    )
    .select("id")
    .single();
  if (error) {
    if (storage_path) await sb().storage.from("vibelog-evidencias").remove([storage_path]);
    throw error;
  }
  console.log(data.id);
}
function campoRaw(cabecalho: string, nome: string) {
  return new RegExp(`^${nome}:\\s*([^\\r\\n]+)`, "m")
    .exec(cabecalho)?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, "");
}
async function importarMd(dir: string) {
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const registros = new Map<string, Registro>();
  for (const arquivo of arquivos) {
    const origem = path.join(dir, arquivo);
    const raw = await readFile(origem, "utf8");
    const { data, content } = matter(raw);
    const header = raw.split(/^---\s*$/m)[1] ?? "";
    const id = campoRaw(header, "id");
    if (!id) throw new Error(`Frontmatter sem id: ${arquivo}`);
    const pai = campoRaw(header, "pai");
    const autor = String(data.autor ?? "desconhecido");
    const tipo =
      data.tipo ?? (/claude|codex|cursor|antigravity/i.test(autor) ? "prompt_ia" : "prompt_humano");
    const dataIso = data.data ? new Date(data.data).toISOString() : undefined;
    if (registros.has(`md:${id}`)) throw new Error(`ID Markdown duplicado: ${id}`);
    registros.set(`md:${id}`, {
      tipo: z.enum(tipos).parse(tipo),
      area: z.enum(areas).parse(data.area ?? "geral"),
      autor,
      destino: data.destino ? String(data.destino) : undefined,
      modelo: data.modelo ? String(data.modelo) : undefined,
      titulo:
        content
          .trim()
          .split("\n")
          .find(Boolean)
          ?.replace(/^#+\s*/, "")
          .slice(0, 140) ?? arquivo,
      conteudo: content.trim(),
      origem_id: `md:${id}`,
      origem,
      pai: pai && pai !== "null" ? `md:${pai}` : undefined,
      criado_em: dataIso,
      meta: {
        repo: "TCS-Financial-Bootcamp-Team/fraudradar",
        ...(data.resultado ? { resultado: String(data.resultado) } : {}),
      },
    });
  }
  const ordenados: Registro[] = [];
  const vistos = new Set<string>();
  const pilha = new Set<string>();
  function visitar(id: string) {
    if (vistos.has(id)) return;
    if (pilha.has(id)) throw new Error(`Ciclo nos pais: ${id}`);
    const no = registros.get(id);
    if (!no) throw new Error(`Pai ausente nos Markdown: ${id}`);
    pilha.add(id);
    if (no.pai) visitar(no.pai);
    pilha.delete(id);
    vistos.add(id);
    ordenados.push(no);
  }
  registros.forEach((_, id) => visitar(id));
  let quantidade = 0;
  for (const n of ordenados) {
    await gravar(n);
    quantidade++;
  }
  console.log(`${quantidade} nós ${seco ? "previstos (dry-run)" : "importados/atualizados"}.`);
}
async function main() {
  if (v.help || !cmd) {
    console.log(
      `VibeLog — registro de construção\n\nno --tipo --area --autor --titulo [--pai id|origem_id] [--destino] [--modelo] [--branch] [--commit] [--origem-id] (--arquivo caminho | stdin)\nevidencia --no id --tipo print|commit|log|link|arquivo (--arquivo caminho | --url URL) [--legenda]\nprint --no id --url http://localhost:3000/... [--tema claro|escuro] [--legenda]\nimportar-md diretório [--dry-run]\nimportar-claude sessão.jsonl [--area geral] [--autor pedro] [--dry-run]\nimportar-codex sessão.jsonl [--area geral] [--autor pedro] [--dry-run]`,
    );
    return;
  }
  if (cmd === "no") {
    const conteudo = await lerEntrada();
    if (!conteudo.trim()) throw new Error("Conteúdo vazio.");
    console.log(
      await gravar({
        tipo: z.enum(tipos).parse(requerido("tipo")),
        area: z.enum(areas).parse(requerido("area")),
        autor: requerido("autor"),
        titulo: requerido("titulo"),
        conteudo,
        origem: v.arquivo as string | undefined,
        pai: v.pai as string | undefined,
        destino: v.destino as string | undefined,
        modelo: v.modelo as string | undefined,
        branch: v.branch as string | undefined,
        commit_sha: v.commit as string | undefined,
        origem_id: v["origem-id"] as string | undefined,
      }),
    );
    return;
  }
  if (cmd === "evidencia") {
    if (seco) throw new Error("Use --dry-run apenas em nós e importadores.");
    if (v.arquivo && v.url) throw new Error("Escolha --arquivo ou --url.");
    await evidencia(
      requerido("no"),
      requerido("tipo"),
      v.arquivo as string | undefined,
      v.url as string | undefined,
      v.legenda as string | undefined,
    );
    return;
  }
  if (cmd === "print") {
    if (seco) throw new Error("Use --dry-run apenas em nós e importadores.");
    const url = new URL(requerido("url"));
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL inválida.");
    const tema = z.enum(["claro", "escuro"]).parse(v.tema ?? "claro");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        colorScheme: tema === "escuro" ? "dark" : "light",
      });
      await page.addInitScript(
        (t) => {
          localStorage.setItem("theme", t);
        },
        tema === "escuro" ? "dark" : "light",
      );
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await evidencia(
        requerido("no"),
        "print",
        "captura.png",
        undefined,
        v.legenda as string | undefined,
        await page.screenshot({ fullPage: true }),
      );
    } finally {
      await browser.close();
    }
    return;
  }
  if (cmd === "importar-md") {
    if (!alvo) throw new Error("Informe o diretório Markdown.");
    await importarMd(alvo);
    return;
  }
  if (cmd === "importar-claude" || cmd === "importar-codex") {
    if (!alvo) throw new Error("Informe a sessão JSONL.");
    let quantidade = 0;
    for await (const n of lerTranscrito(
      alvo,
      cmd === "importar-claude" ? "claude" : "codex",
      z.enum(areas).parse(v.area ?? "geral"),
      v.autor as string | undefined,
    )) {
      await gravar(n);
      quantidade++;
    }
    console.log(`${quantidade} nós ${seco ? "previstos (dry-run)" : "importados/atualizados"}.`);
    return;
  }
  throw new Error(`Comando desconhecido: ${cmd}. Use --help.`);
}
main().catch((e) => {
  const detalhe =
    e instanceof z.ZodError
      ? "Parâmetros inválidos. Consulte --help."
      : e instanceof Error
        ? e.message
        : typeof e?.message === "string"
          ? e.message
          : "Falha na operação.";
  console.error(redigir(detalhe));
  process.exitCode = 1;
});
