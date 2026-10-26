import { build } from "esbuild";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Cada arquivo roda isolado: a configuração pública é capturada ao importar os serviços.
const web = dirname(dirname(fileURLToPath(import.meta.url)));
const temporarios = join(web, "..", "trash");
await mkdir(temporarios, { recursive: true });
const saida = await mkdtemp(join(temporarios, "testes-web-"));
try {
  const entradas = (await readdir(join(web, "tests")))
    .filter((nome) => nome.endsWith(".test.ts"))
    .map((nome) => join(web, "tests", nome));
  await build({
    entryPoints: entradas,
    outdir: saida,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    tsconfig: join(web, "tsconfig.json"),
    logLevel: "warning",
  });
  const arquivos = (await readdir(saida)).map((nome) => join(saida, nome));
  const resultado = spawnSync(process.execPath, ["--test", ...arquivos], {
    stdio: "inherit",
    cwd: web,
    windowsHide: true,
  });
  if (resultado.error) throw resultado.error;
  process.exitCode = resultado.status ?? 1;
} finally {
  await rm(saida, { recursive: true, force: true });
}
