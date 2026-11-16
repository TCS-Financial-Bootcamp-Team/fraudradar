import { useTranslations } from "next-intl";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import type { Job } from "@/features/jobs/schemas/jobs";

export function JobProgress({ job, error }: { job: Job; error: string }) {
  const t = useTranslations("jobs");
  const jobMessage = useJobMessage();
  const message = jobMessage(job);
  return (
    <div
      className="flex flex-col gap-1.5 pt-3 border-t border-border"
      role="status"
    >
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {t(`kind.${job.kind}`)} · {t(`status.${job.status}`)}
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
      {message && (
        <p className="m-0 text-xs text-muted-foreground">{message}</p>
      )}
      {error && error !== message && (
        <p role="alert" className="m-0 text-xs text-signal">
          {error}
        </p>
      )}
    </div>
  );
}
