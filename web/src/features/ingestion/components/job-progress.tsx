import type { Job } from "../schemas/ingestion";

const kindLabel: Record<Job["kind"], string> = {
  import: "Importação",
  process: "Processamento",
  train: "Treino",
};
const statusLabel: Record<Job["status"], string> = {
  queued: "Na fila",
  running: "Em andamento",
  done: "Concluído",
  failed: "Falhou",
};

export function JobProgress({ job, error }: { job: Job; error: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 pt-3 border-t border-border"
      role="status"
    >
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {kindLabel[job.kind]} · {statusLabel[job.status]}
        </span>
        <span className="font-mono tabular-nums">{job.progress}%</span>
      </div>
      <div className="h-2 w-full bg-track rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            job.status === "failed" ? "bg-signal" : "bg-primary"
          }`}
          style={{ width: `${job.progress}%` }}
        />
      </div>
      {job.message && (
        <p className="m-0 text-xs text-muted-foreground">{job.message}</p>
      )}
      {error && error !== job.message && (
        <p role="alert" className="m-0 text-xs text-signal">
          {error}
        </p>
      )}
    </div>
  );
}
