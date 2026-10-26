import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";
import {
  indiceSchema,
  resumoSchema,
  noSchema,
  evidenciaSchema,
  lerFiltros,
  type Resumo,
} from "../schemas";
import { comAncestrais, filtrar, urlSegura } from "./arvore";
const campos = "id,pai_id,tipo,area,autor,branch,criado_em";
export async function consultar(p: URLSearchParams) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("SESSAO");
  const modo = p.get("modo") ?? "visao";
  if (modo === "detalhe") {
    const id = z.uuid().parse(p.get("id"));
    const { data, error } = await sb.from("vibelog_nos").select("*").eq("id", id).single();
    if (error) throw error;
    const no = noSchema.parse(data);
    const ancestrais: Resumo[] = [];
    const vistos = new Set([id]);
    let pai = no.pai_id;
    while (pai && !vistos.has(pai)) {
      vistos.add(pai);
      const r = await sb
        .from("vibelog_nos")
        .select(`${campos},titulo,resumo`)
        .eq("id", pai)
        .single();
      if (r.error) throw r.error;
      const n = resumoSchema.parse(r.data);
      ancestrais.unshift(n);
      pai = n.pai_id;
    }
    const r = await sb.from("vibelog_evidencias").select("*").eq("no_id", id).order("criado_em");
    if (r.error) throw r.error;
    const evidencias = await Promise.all(
      z
        .array(evidenciaSchema)
        .parse(r.data)
        .map(async (e) => {
          if (!e.storage_path) return { ...e, assinada: urlSegura(e.url) };
          const signed = await sb.storage
            .from("vibelog-evidencias")
            .createSignedUrl(e.storage_path, 3600);
          if (signed.error) throw signed.error;
          return { ...e, assinada: urlSegura(signed.data.signedUrl) };
        }),
    );
    return { no, ancestrais, evidencias };
  }
  if (modo === "lista") {
    const ids = z
      .array(z.uuid())
      .max(50)
      .parse((p.get("ids") ?? "").split(",").filter(Boolean));
    if (!ids.length) return [];
    const { data, error } = await sb
      .from("vibelog_nos")
      .select(`${campos},titulo,resumo`)
      .in("id", ids)
      .order("criado_em")
      .order("id");
    if (error) throw error;
    return z.array(resumoSchema).parse(data);
  }
  if (modo === "filhos") {
    const pai = p.get("pai");
    if (pai) z.uuid().parse(pai);
    const pagina = z.coerce
      .number()
      .int()
      .min(0)
      .parse(p.get("pagina") ?? 0);
    let q = sb
      .from("vibelog_nos")
      .select(`${campos},titulo,resumo`)
      .order("criado_em")
      .order("id")
      .range(pagina * 100, pagina * 100 + 99);
    q = pai ? q.eq("pai_id", pai) : q.is("pai_id", null);
    const { data, error } = await q;
    if (error) throw error;
    return z.array(resumoSchema).parse(data);
  }
  if (modo !== "visao") throw new Error("Consulta inválida.");
  const indice = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("vibelog_nos")
      .select(campos)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    indice.push(...z.array(indiceSchema).parse(data));
    if (data.length < 1000) break;
  }
  const filtros = lerFiltros(p);
  let busca: Set<string> | undefined;
  if (filtros.q.trim()) {
    busca = new Set();
    const termo = filtros.q
      .trim()
      .replace(/[\\%_]/g, "\\$&")
      .replace(/[(),\"]/g, " ");
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("vibelog_nos")
        .select("id")
        .or(`titulo.ilike.%${termo}%,conteudo.ilike.%${termo}%`)
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      data.forEach((n) => busca!.add(n.id));
      if (data.length < 1000) break;
    }
  }
  const correspondencias = filtrar(indice, filtros, busca);
  return { indice, correspondencias, visiveis: comAncestrais(indice, correspondencias) };
}
