import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("Compose repassa a configuração pública do .env raiz à etapa de build do web", async () => {
  const raiz = path.resolve("..");
  const temporarios = path.join(raiz, "trash");
  await mkdir(temporarios, { recursive: true });
  const dir = await mkdtemp(path.join(temporarios, "compose-web-"));
  const esperadas = {
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ficticia",
    NEXT_PUBLIC_USE_MOCKS: "true",
  };
  try {
    await mkdir(path.join(dir, "infra"));
    await writeFile(
      path.join(dir, "compose.yaml"),
      await readFile(path.join(raiz, "compose.yaml")),
    );
    await writeFile(
      path.join(dir, "infra", "docker-compose.yml"),
      await readFile(path.join(raiz, "infra", "docker-compose.yml")),
    );
    await writeFile(
      path.join(dir, ".env"),
      Object.entries(esperadas)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
    const env = { ...process.env };
    for (const k of Object.keys(esperadas)) delete env[k];
    const compose = spawnSync(
      "docker",
      ["compose", "config", "--format", "json"],
      {
        cwd: dir,
        encoding: "utf8",
        windowsHide: true,
        env,
      },
    );
    assert.ifError(compose.error);
    assert.equal(compose.status, 0, compose.stderr);
    const args = JSON.parse(compose.stdout).services.web.build.args;
    const dockerfile = await readFile(
      path.join(raiz, "web", "Dockerfile"),
      "utf8",
    );
    const build = dockerfile
      .split("FROM base AS build")[1]
      .split("FROM node:24-alpine AS runner")[0];
    for (const [nome, valor] of Object.entries(esperadas)) {
      assert.equal(args[nome], valor);
      assert.match(build, new RegExp(`ARG ${nome}(?:=|\\r?\\n)`));
      assert.ok(
        build.indexOf(`${nome}=$${nome}`) < build.indexOf("RUN pnpm build"),
      );
      assert.ok(build.includes(`${nome}=$${nome}`));
    }
    assert.equal("SUPABASE_SECRET_KEY" in args, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
