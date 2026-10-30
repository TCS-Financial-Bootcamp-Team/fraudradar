import { build } from "esbuild";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Cada arquivo roda isolado: a configuração pública é capturada ao importar os serviços.
const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = join(webDir, "..", "trash");
await mkdir(tempDir, { recursive: true });
const outDir = await mkdtemp(join(tempDir, "web-tests-"));
try {
  const entryPoints = (await readdir(join(webDir, "tests")))
    .filter((fileName) => fileName.endsWith(".test.ts"))
    .map((fileName) => join(webDir, "tests", fileName));
  await build({
    entryPoints,
    outdir: outDir,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    tsconfig: join(webDir, "tsconfig.json"),
    logLevel: "warning",
  });
  const testFiles = (await readdir(outDir)).map((fileName) =>
    join(outDir, fileName),
  );
  const result = spawnSync(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit",
    cwd: webDir,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outDir, { recursive: true, force: true });
}
