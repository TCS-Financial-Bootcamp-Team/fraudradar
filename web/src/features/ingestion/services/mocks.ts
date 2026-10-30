import type { DataSource, Receipt } from "../schemas/ingestion";
export const dataSourcesMock: DataSource[] = [
  {
    id: "source-1",
    name: "Base de operações · sandbox",
    type: "postgres",
    masked_host: "san•••.local",
    masked_database: "ope•••",
    status: "connected",
    last_synced_at: "2026-10-21T11:00:00Z",
  },
];
export function receiptMock(message: string): Receipt {
  return { id: crypto.randomUUID(), status: "received", message };
}
