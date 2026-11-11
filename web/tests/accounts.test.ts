import assert from "node:assert/strict";
import { test } from "node:test";

test("contas suspeitas: mock agrega, ordena e filtra a lista", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const service = await import(
    "../src/features/accounts/services/accounts-service"
  );
  const result = await service.fetchSuspiciousAccounts({
    sort: "max_score_desc",
  });
  assert.ok(result.total > 0);
  assert.ok(
    result.items.every(
      (item) => item.latest_alert_id && item.alert_weeks > 0,
    ),
  );
  assert.ok(
    result.items.every(
      (item, index) => index === 0 || result.items[index - 1].max_score >= item.max_score,
    ),
  );

  const searched = await service.fetchSuspiciousAccounts({
    search: result.items[0].account,
  });
  assert.equal(searched.items[0].account, result.items[0].account);
});
