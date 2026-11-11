import type { CompatibilityReport as Report } from "../schemas/ingestion";
import {
  dateRange,
  formatRows,
  groundTruthText,
  overlapSummary,
  reportChecks,
  type Tone,
} from "../services/connection-model";

const dotClass: Record<Tone, string> = {
  ok: "bg-primary",
  fail: "bg-signal",
  info: "bg-muted-foreground",
};
const toneText: Record<Tone, string> = {
  ok: "Passou",
  fail: "Falhou",
  info: "Informação",
};

export function CompatibilityReport({ report }: { report: Report }) {
  const overlap = overlapSummary(report);
  return (
    <div
      className="flex flex-col gap-3 pt-3 border-t border-border"
      aria-label="Relatório de compatibilidade"
    >
      <h3 className="m-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Relatório de compatibilidade
      </h3>
      <ul className="m-0 p-0 list-none divide-y divide-soft border border-border rounded-lg overflow-hidden">
        {reportChecks(report).map((check) => (
          <li key={check.key} className="p-3 flex items-start gap-2.5 text-xs">
            <span
              aria-hidden
              className={`mt-1 size-2 shrink-0 rounded-full ${dotClass[check.tone]}`}
            />
            <div>
              <p className="m-0 font-medium text-foreground">
                {check.label}{" "}
                <span className="font-normal text-muted-foreground">
                  · {toneText[check.tone]}
                </span>
              </p>
              <p className="m-0 text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Gabarito</dt>
        <dd className="m-0">{groundTruthText(report)}</dd>
        <dt className="text-muted-foreground">Linhas na tabela</dt>
        <dd className="m-0 font-mono tabular-nums">
          {formatRows(report.row_count)}
        </dd>
        <dt className="text-muted-foreground">Intervalo de datas</dt>
        <dd className="m-0 font-mono tabular-nums">{dateRange(report)}</dd>
        {overlap && (
          <>
            <dt className="text-muted-foreground">Contas em comum</dt>
            <dd className="m-0">{overlap.accounts}</dd>
            <dt className="text-muted-foreground">Datas</dt>
            <dd className="m-0">{overlap.dates}</dd>
          </>
        )}
      </dl>
      {report.suggestion && (
        <p className="m-0 p-2.5 text-xs leading-relaxed bg-muted/30 border border-border rounded-lg">
          <span className="font-medium">Sugestão (quem decide é você): </span>
          {report.suggestion.message}
        </p>
      )}
    </div>
  );
}
