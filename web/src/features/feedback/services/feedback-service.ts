import { apiGet, USE_MOCKS } from "@/lib/api";
import {
  feedbackSummarySchema,
  type FeedbackRange,
} from "../schemas/feedback";

export async function fetchFeedbackSummary(
  range: FeedbackRange = {},
  signal?: AbortSignal,
) {
  if (USE_MOCKS)
    return feedbackSummarySchema.parse(
      (await import("./mocks")).feedbackSummaryMock(range),
    );
  const query = new URLSearchParams();
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const search = query.toString();
  return feedbackSummarySchema.parse(
    await apiGet("/feedback/summary" + (search ? "?" + search : ""), {
      signal,
    }),
  );
}
