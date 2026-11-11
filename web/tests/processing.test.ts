import assert from "node:assert/strict";
import { test } from "node:test";

test("processamento: polling consulta até done e para no estado terminal", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const service = await import(
    "../src/features/processing/services/processing-service"
  );
  const created = await service.enqueueProcess("saml-d");
  const updates: string[] = [];

  const finished = await service.pollJob(created.id, {
    intervalMs: 0,
    onUpdate: (job) => updates.push(job.status),
  });

  assert.equal(finished.status, "done");
  assert.deepEqual(updates, ["running", "running", "done"]);
});
