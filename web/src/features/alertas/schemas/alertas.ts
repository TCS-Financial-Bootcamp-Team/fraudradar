import { z } from "zod";

export const statusSchema = z.enum([
  "pendente",
  "aprofundar",
  "arquivado",
  "comunicar",
]);
export const alertaSchema = z.object({
  id: z.string(),
  conta: z.string(),
  semana: z.iso.date(),
  pais: z.string(),
  tipologia: z.string(),
  score: z.number().min(0).max(100),
  valor: z.number().nonnegative(),
  transacoes: z.number().int().nonnegative(),
  status: statusSchema,
});
export const filaSchema = z.object({
  itens: z.array(alertaSchema),
  total: z.number().int().nonnegative(),
  paises: z.array(z.string()),
});
export const parecerSchema = z.object({
  texto: z.string(),
  fontes: z.array(z.object({ titulo: z.string(), trecho: z.string() })),
});
export const detalheSchema = alertaSchema.extend({
  contribuicoes: z.array(
    z.object({ nome: z.string(), valor: z.number().min(0).max(100) }),
  ),
  regras: z.array(z.object({ codigo: z.string(), descricao: z.string() })),
  movimentacoes: z.array(
    z.object({
      id: z.string(),
      data: z.string(),
      origem: z.string(),
      destino: z.string(),
      valor: z.number(),
      moeda: z.string(),
      meio: z.string(),
    }),
  ),
  parecer: parecerSchema.nullable(),
});
export const grafoSchema = z.object({
  nos: z.array(
    z.object({ id: z.string(), rotulo: z.string(), central: z.boolean() }),
  ),
  arestas: z.array(
    z.object({
      id: z.string(),
      origem: z.string(),
      destino: z.string(),
      valor: z.number(),
    }),
  ),
});
export const decisaoSchema = z.object({
  decisao: z.enum(["arquivar", "aprofundar", "comunicar"]),
  justificativa: z
    .string()
    .trim()
    .min(10, "Descreva a justificativa com pelo menos 10 caracteres.")
    .max(4000),
});
export const comunicacaoSchema = z.object({
  alerta_id: z.string(),
  texto: z.string(),
  status: z.enum(["rascunho", "aprovada"]),
  atualizado_em: z.string(),
});
export const aprovacaoSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(30, "Revise o rascunho: mínimo de 30 caracteres.")
    .max(20000),
});
export const replaySchema = z.object({
  semana: z.iso.date(),
  alertas_gerados: z.number().int().nonnegative(),
});
export const serieSchema = z.object({
  nome: z.string(),
  valor: z.number().nonnegative(),
});
export const monitoramentoSchema = z.object({
  semana: z.iso.date(),
  indicadores: z.object({
    alertas: z.number(),
    revisados: z.number(),
    comunicados: z.number(),
    taxa_alerta: z.number().min(0).max(1),
    valor_sinalizado: z.number(),
    recall: z.number().min(0).max(1),
    acerto_tipologia: z.number().min(0).max(1),
  }),
  semanas: z.array(serieSchema),
  tipologias: z.array(serieSchema),
  paises: z.array(serieSchema),
  taxa_paises: z.array(serieSchema),
  taxa_meios: z.array(serieSchema),
});
export type Alerta = z.infer<typeof alertaSchema>;
export type Detalhe = z.infer<typeof detalheSchema>;
export type Grafo = z.infer<typeof grafoSchema>;
export type Decisao = z.infer<typeof decisaoSchema>;
export type Comunicacao = z.infer<typeof comunicacaoSchema>;
export type Monitoramento = z.infer<typeof monitoramentoSchema>;
export type Serie = z.infer<typeof serieSchema>;
export type Filtros = {
  semana: string;
  status?: string;
  pais?: string;
  pagina?: number;
};
