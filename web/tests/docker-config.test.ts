import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("Compose repassa a configuração pública do .env raiz à etapa de build do web", async () => {
  const rootDir = path.resolve("..");
  const tempDir = path.join(rootDir, "trash");
  await mkdir(tempDir, { recursive: true });
  const dir = await mkdtemp(path.join(tempDir, "compose-web-"));
  const expectedArgs = {
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dummy",
    NEXT_PUBLIC_USE_MOCKS: "true",
  };
  try {
    await mkdir(path.join(dir, "infra"));
    await writeFile(
      path.join(dir, "compose.yaml"),
      await readFile(path.join(rootDir, "compose.yaml")),
    );
    await writeFile(
      path.join(dir, "infra", "docker-compose.yml"),
      await readFile(path.join(rootDir, "infra", "docker-compose.yml")),
    );
    await writeFile(
      path.join(dir, ".env"),
      Object.entries(expectedArgs)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
    const env = { ...process.env };
    for (const k of Object.keys(expectedArgs)) delete env[k];
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
      path.join(rootDir, "web", "Dockerfile"),
      "utf8",
    );
    const buildStage = dockerfile
      .split("FROM base AS build")[1]
      .split("FROM node:24-alpine AS runner")[0];
    for (const [key, expected] of Object.entries(expectedArgs)) {
      assert.equal(args[key], expected);
      assert.match(buildStage, new RegExp(`ARG ${key}(?:=|\\r?\\n)`));
      assert.ok(
        buildStage.indexOf(`${key}=$${key}`) <
          buildStage.indexOf("RUN pnpm build"),
      );
      assert.ok(buildStage.includes(`${key}=$${key}`));
    }
    assert.equal("SUPABASE_SECRET_KEY" in args, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
