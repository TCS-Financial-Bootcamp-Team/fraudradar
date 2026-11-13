import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { serverMessageKey } from "../src/i18n/server-messages";
import { catalogs } from "../src/i18n/messages";

// O teste roda com a pasta `web` como diretório atual (scripts/run-tests.mjs).
const repoRoot = join(process.cwd(), "..");

function pythonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "__pycache__" || name.startsWith(".")) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? pythonFiles(path)
      : path.endsWith(".py")
        ? [path]
        : [];
  });
}

const AREAS =
  "auth|dataset|alert|report|job|ingestion|simulation|model|retrain|ai|replay|connection|import|source|compat";

// Códigos que ficam sem tradução de propósito: o texto vem de uma exceção (`str(exc)`) e o
// front mostra o `detail` em português, como antes.
const FALLBACK_ONLY = new Set([
  "source.error",
  "dataset.invalid",
  "connection.secret_key",
  "model.promotion_blocked", // só quando a ficha não traz o motivo da trava
  "ingestion.invalid", // 422 em lista: o front lê `params.errors`, item a item
]);

function serverCodes(): string[] {
  const found = new Set<string>();
  const pattern = new RegExp(`["']((?:${AREAS})\\.[a-z_]+)["']`, "g");
  for (const folder of ["api", "worker", join("src", "fraudradar")]) {
    for (const file of pythonFiles(join(repoRoot, folder))) {
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        found.add(match[1]);
      }
    }
  }
  return [...found].sort();
}

test("todo código de mensagem do servidor tem texto nos dois idiomas (ou é só detail)", () => {
  const codes = serverCodes();
  assert.ok(codes.length > 60, `achou só ${codes.length} códigos`);
  for (const locale of ["pt-BR", "en"] as const) {
    const api = catalogs[locale].errors.api as Record<string, string>;
    const missing = codes.filter(
      (code) => !FALLBACK_ONLY.has(code) && !(serverMessageKey(code) in api),
    );
    assert.deepEqual(missing, [], `códigos sem tradução em ${locale}`);
  }
});

test("os textos em português do servidor e do front dizem o mesmo (códigos sem parâmetro)", () => {
  const api = catalogs["pt-BR"].errors.api as Record<string, string>;
  assert.equal(
    api[serverMessageKey("retrain.no_labels")],
    "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas.",
  );
  assert.equal(
    api[serverMessageKey("job.process_nothing")],
    "Nada novo para processar.",
  );
});
