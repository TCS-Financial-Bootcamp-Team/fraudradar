import { z } from "zod";
export const areas = [
  "frontend",
  "backend",
  "ml",
  "ia",
  "dados",
  "infra",
  "docs",
  "geral",
] as const;
export const tipos = ["prompt_humano", "prompt_ia", "resposta", "marco"] as const;
export const rotulos: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  ml: "Machine learning",
  ia: "Inteligência artificial",
  dados: "Dados",
  infra: "Infraestrutura",
  docs: "Documentação",
  geral: "Geral",
  prompt_humano: "Prompt humano",
  prompt_ia: "Prompt de IA",
  resposta: "Resultado",
  marco: "Marco",
};
export const indiceSchema = z.object({
  id: z.uuid(),
  pai_id: z.uuid().nullable(),
  tipo: z.enum(tipos),
  area: z.enum(areas),
  autor: z.string(),
  branch: z.string().nullable(),
  criado_em: z.string(),
});
export const resumoSchema = indiceSchema.extend({
  titulo: z.string(),
  resumo: z.string().nullable(),
});
export const noSchema = resumoSchema.extend({
  conteudo: z.string(),
  destino: z.string().nullable(),
  modelo: z.string().nullable(),
  commit_sha: z.string().nullable(),
  origem: z.string().nullable(),
  origem_id: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export const evidenciaSchema = z.object({
  id: z.uuid(),
  no_id: z.uuid(),
  tipo: z.enum(["print", "commit", "log", "link", "arquivo"]),
  storage_path: z.string().nullable(),
  url: z.string().nullable(),
  legenda: z.string().nullable(),
  criado_em: z.string(),
});
export const filtrosSchema = z.object({
  area: z.array(z.enum(areas)).default([]),
  autor: z.string().default(""),
  tipo: z.union([z.enum(tipos), z.literal("")]).default(""),
  branch: z.string().default(""),
  inicio: z.string().default(""),
  fim: z.string().default(""),
  q: z.string().max(200).default(""),
});
export type Indice = z.infer<typeof indiceSchema>;
export type Resumo = z.infer<typeof resumoSchema>;
export type No = z.infer<typeof noSchema>;
export type Filtros = z.infer<typeof filtrosSchema>;
export type Evidencia = z.infer<typeof evidenciaSchema> & { assinada: string | null };
export type Visao = { indice: Indice[]; correspondencias: string[]; visiveis: string[] };
export function lerFiltros(p: URLSearchParams): Filtros {
  return filtrosSchema.parse({
    area: p.getAll("area").filter((a) => areas.includes(a as (typeof areas)[number])),
    autor: p.get("autor") ?? "",
    tipo: p.get("tipo") ?? "",
    branch: p.get("branch") ?? "",
    inicio: p.get("inicio") ?? "",
    fim: p.get("fim") ?? "",
    q: p.get("q") ?? "",
  });
}
