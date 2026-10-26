import type { Fonte, Recibo } from "../schemas/ingestao";
export const fontesMock: Fonte[] = [
  {
    id: "fonte-1",
    nome: "Base de operações · sandbox",
    tipo: "postgres",
    host_mascarado: "san•••.local",
    banco_mascarado: "ope•••",
    status: "conectada",
    ultima_sincronizacao: "2026-10-21T11:00:00Z",
  },
];
export function reciboMock(mensagem: string): Recibo {
  return { id: crypto.randomUUID(), status: "recebido", mensagem };
}
