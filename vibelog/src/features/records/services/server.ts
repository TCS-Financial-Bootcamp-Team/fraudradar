import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";
import {
  indexSchema,
  summarySchema,
  nodeSchema,
  evidenceSchema,
  parseFilters,
  type NodeSummary,
} from "../schemas";
import { withAncestors, filterRecords, safeUrl } from "./tree";
const SELECT_FIELDS = "id,pai_id,tipo,area,autor,branch,criado_em";
export async function queryRecords(p: URLSearchParams) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("SESSION");
  const mode = p.get("mode") ?? "view";
  if (mode === "detail") {
    const id = z.uuid().parse(p.get("id"));
    const { data, error } = await sb.from("vibelog_nos").select("*").eq("id", id).single();
    if (error) throw error;
    const node = nodeSchema.parse(data);
    const ancestors: NodeSummary[] = [];
    const visited = new Set([id]);
    let parentId = node.pai_id;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const r = await sb
        .from("vibelog_nos")
        .select(`${SELECT_FIELDS},titulo,resumo`)
        .eq("id", parentId)
        .single();
      if (r.error) throw r.error;
      const item = summarySchema.parse(r.data);
      ancestors.unshift(item);
      parentId = item.pai_id;
    }
    const r = await sb.from("vibelog_evidencias").select("*").eq("no_id", id).order("criado_em");
    if (r.error) throw r.error;
    const evidence = await Promise.all(
      z
        .array(evidenceSchema)
        .parse(r.data)
        .map(async (e) => {
          if (!e.storage_path) return { ...e, signedUrl: safeUrl(e.url) };
          const signed = await sb.storage
            .from("vibelog-evidencias")
            .createSignedUrl(e.storage_path, 3600);
          if (signed.error) throw signed.error;
          return { ...e, signedUrl: safeUrl(signed.data.signedUrl) };
        }),
    );
    return { node, ancestors, evidence };
  }
  if (mode === "list") {
    const ids = z
      .array(z.uuid())
      .max(50)
      .parse((p.get("ids") ?? "").split(",").filter(Boolean));
    if (!ids.length) return [];
    const { data, error } = await sb
      .from("vibelog_nos")
      .select(`${SELECT_FIELDS},titulo,resumo`)
      .in("id", ids)
      .order("criado_em")
      .order("id");
    if (error) throw error;
    return z.array(summarySchema).parse(data);
  }
  if (mode === "children") {
    const parentId = p.get("parent");
    if (parentId) z.uuid().parse(parentId);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .parse(p.get("page") ?? 0);
    let q = sb
      .from("vibelog_nos")
      .select(`${SELECT_FIELDS},titulo,resumo`)
      .order("criado_em")
      .order("id")
      .range(page * 100, page * 100 + 99);
    q = parentId ? q.eq("pai_id", parentId) : q.is("pai_id", null);
    const { data, error } = await q;
    if (error) throw error;
    return z.array(summarySchema).parse(data);
  }
  if (mode !== "view") throw new Error("Consulta inválida.");
  const index = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("vibelog_nos")
      .select(`${SELECT_FIELDS},titulo`)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    index.push(...z.array(indexSchema).parse(data));
    if (data.length < 1000) break;
  }
  const filters = parseFilters(p);
  let searchMatches: Set<string> | undefined;
  if (filters.q.trim()) {
    searchMatches = new Set();
    const term = filters.q
      .trim()
      .replace(/[\\%_]/g, "\\$&")
      .replace(/[(),\"]/g, " ");
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("vibelog_nos")
        .select("id")
        .or(`titulo.ilike.%${term}%,conteudo.ilike.%${term}%`)
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      data.forEach((n) => searchMatches!.add(n.id));
      if (data.length < 1000) break;
    }
  }
  const matches = filterRecords(index, filters, searchMatches);
  return { index, matches, visible: withAncestors(index, matches) };
}
