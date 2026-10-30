import { z } from "zod";
export const AREAS = [
  "frontend",
  "backend",
  "ml",
  "ia",
  "dados",
  "infra",
  "docs",
  "geral",
] as const;
export const NODE_TYPES = ["prompt_humano", "prompt_ia", "resposta", "marco"] as const;
export const LABELS: Record<string, string> = {
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
export const indexSchema = z.object({
  id: z.uuid(),
  pai_id: z.uuid().nullable(),
  tipo: z.enum(NODE_TYPES),
  area: z.enum(AREAS),
  autor: z.string(),
  branch: z.string().nullable(),
  criado_em: z.string(),
  titulo: z.string().optional(),
});
export const summarySchema = indexSchema.extend({
  titulo: z.string(),
  resumo: z.string().nullable(),
});
export const nodeSchema = summarySchema.extend({
  conteudo: z.string(),
  destino: z.string().nullable(),
  modelo: z.string().nullable(),
  commit_sha: z.string().nullable(),
  origem: z.string().nullable(),
  origem_id: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export const evidenceSchema = z.object({
  id: z.uuid(),
  no_id: z.uuid(),
  tipo: z.enum(["print", "commit", "log", "link", "arquivo"]),
  storage_path: z.string().nullable(),
  url: z.string().nullable(),
  legenda: z.string().nullable(),
  criado_em: z.string(),
});
export const filtersSchema = z.object({
  area: z.array(z.enum(AREAS)).default([]),
  author: z.string().default(""),
  type: z.union([z.enum(NODE_TYPES), z.literal("")]).default(""),
  branch: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  q: z.string().max(200).default(""),
});
export type NodeIndex = z.infer<typeof indexSchema>;
export type NodeSummary = z.infer<typeof summarySchema>;
export type NodeRecord = z.infer<typeof nodeSchema>;
export type Filters = z.infer<typeof filtersSchema>;
export type Evidence = z.infer<typeof evidenceSchema> & { signedUrl: string | null };
export type View = { index: NodeIndex[]; matches: string[]; visible: string[] };
export function parseFilters(p: URLSearchParams): Filters {
  return filtersSchema.parse({
    area: p.getAll("area").filter((a) => AREAS.includes(a as (typeof AREAS)[number])),
    author: p.get("author") ?? "",
    type: p.get("type") ?? "",
    branch: p.get("branch") ?? "",
    start: p.get("start") ?? "",
    end: p.get("end") ?? "",
    q: p.get("q") ?? "",
  });
}
