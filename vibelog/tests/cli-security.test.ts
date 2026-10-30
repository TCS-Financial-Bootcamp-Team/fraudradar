import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseSafeMarkdown } from "../scripts/markdown";
import { prepareEvidence } from "../scripts/evidence";

test("Markdown aceita só YAML seguro, incluindo BOM e CRLF", () => {
  for (const lang of ["", "yaml", "yml"]) {
    const { data, content, header } = parseSafeMarkdown(
      `\uFEFF---${lang}\r\nid: tarefa-1\r\nautor: pedro\r\n---\r\n# Conteúdo`,
    );
    assert.equal(data.id, "tarefa-1");
    assert.equal(content, "# Conteúdo");
    assert.match(header, /id: tarefa-1/);
  }
  for (const lang of ["js", "javascript", "json", "toml", " yaml javascript"]) {
    assert.throws(
      () => parseSafeMarkdown(`---${lang}\nid: tarefa-1\n---\nTexto`),
      /somente YAML seguro/,
    );
  }
  assert.throws(() =>
    parseSafeMarkdown('---\nid: !!js/function "function() { return 1; }"\n---\nTexto'),
  );
  assert.throws(() => parseSafeMarkdown("---\nid: aberto"), /fechamento/);
});

test("import-md --dry-run rejeita JavaScript antes de executar qualquer expressão", async () => {
  const rootDir = path.resolve("trash");
  await mkdir(rootDir, { recursive: true });
  const dir = await mkdtemp(path.join(rootDir, "frontmatter-"));
  const markerPath = path.join(dir, "executou.txt");
  try {
    for (const lang of ["js", "javascript"]) {
      await writeFile(
        path.join(dir, "entrada.md"),
        `---${lang}\n(process.getBuiltinModule("fs").writeFileSync(${JSON.stringify(markerPath)}, "executou"), { id: "malicioso" })\n---\nTexto`,
      );
      const procResult = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/vibelog.ts", "import-md", dir, "--dry-run"],
        {
          encoding: "utf8",
          windowsHide: true,
          env: { ...process.env, SUPABASE_SECRET_KEY: "segredo-ficticio-de-teste" },
        },
      );
      assert.ifError(procResult.error);
      assert.equal(procResult.status, 1);
      assert.match(procResult.stderr, /somente YAML seguro/);
      assert.doesNotMatch(procResult.stdout + procResult.stderr, /segredo-ficticio-de-teste/);
      await assert.rejects(readFile(markerPath), { code: "ENOENT" });
    }
    await writeFile(
      path.join(dir, "entrada.md"),
      "---yaml\nid: seguro\nautor: pedro\n---\n# Teste Authorization: Bearer opaco-de-teste",
    );
    const safeRun = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/vibelog.ts", "import-md", dir, "--dry-run"],
      { encoding: "utf8", windowsHide: true },
    );
    assert.ifError(safeRun.error);
    assert.equal(safeRun.status, 0, safeRun.stderr);
    assert.match(safeRun.stdout, /md:seguro/);
    assert.doesNotMatch(safeRun.stdout, /opaco-de-teste/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("anexos textuais são redigidos pelo conteúdo em qualquer extensão", () => {
  for (const fileName of [
    "script.ps1",
    "componente.tsx",
    "arquivo.desconhecido",
    "sem-extensao",
    "falso.png",
  ]) {
    const attachment = prepareEvidence(
      fileName,
      Buffer.from("sb_secret_ficticio\nAuthorization: Bearer opaco\npostgresql://:senha@host/db"),
    );
    assert.equal(attachment.mime, "text/plain; charset=utf-8");
    assert.doesNotMatch(attachment.bytes.toString(), /sb_secret_ficticio|opaco|:senha@/);
    assert.match(attachment.bytes.toString(), /REMOVID/);
  }
});

test("bloqueia arquivos de credenciais e binários que não podem ser redigidos", () => {
  for (const fileName of [
    ".env",
    ".env.local",
    ".env.production",
    "app.env.local",
    "credentials.json",
    "secrets.yaml",
    "id_rsa",
    "chave.pem",
    ".npmrc",
    ".pgpass",
  ]) {
    assert.throws(() => prepareEvidence(fileName, Buffer.from("credencial opaca")), /credenciais/);
  }
  for (const fileName of ["dados.bin", "texto.txt", "falso.png"]) {
    assert.throws(
      () => prepareEvidence(fileName, Buffer.from([0xff, 0x00, 0x41])),
      /não suportado/,
    );
  }
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  assert.deepEqual(prepareEvidence("captura.png", png), { bytes: png, mime: "image/png" });
});
