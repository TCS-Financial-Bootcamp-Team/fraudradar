import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { lerMarkdownSeguro } from "../scripts/markdown";
import { prepararEvidencia } from "../scripts/evidencias";

test("Markdown aceita só YAML seguro, incluindo BOM e CRLF", () => {
  for (const idioma of ["", "yaml", "yml"]) {
    const { data, content, header } = lerMarkdownSeguro(
      `\uFEFF---${idioma}\r\nid: tarefa-1\r\nautor: pedro\r\n---\r\n# Conteúdo`,
    );
    assert.equal(data.id, "tarefa-1");
    assert.equal(content, "# Conteúdo");
    assert.match(header, /id: tarefa-1/);
  }
  for (const idioma of ["js", "javascript", "json", "toml", " yaml javascript"]) {
    assert.throws(
      () => lerMarkdownSeguro(`---${idioma}\nid: tarefa-1\n---\nTexto`),
      /somente YAML seguro/,
    );
  }
  assert.throws(() =>
    lerMarkdownSeguro('---\nid: !!js/function "function() { return 1; }"\n---\nTexto'),
  );
  assert.throws(() => lerMarkdownSeguro("---\nid: aberto"), /fechamento/);
});

test("importar-md --dry-run rejeita JavaScript antes de executar qualquer expressão", async () => {
  const raiz = path.resolve("trash");
  await mkdir(raiz, { recursive: true });
  const dir = await mkdtemp(path.join(raiz, "frontmatter-"));
  const marcador = path.join(dir, "executou.txt");
  try {
    for (const idioma of ["js", "javascript"]) {
      await writeFile(
        path.join(dir, "entrada.md"),
        `---${idioma}\n(process.getBuiltinModule("fs").writeFileSync(${JSON.stringify(marcador)}, "executou"), { id: "malicioso" })\n---\nTexto`,
      );
      const resultado = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/vibelog.ts", "importar-md", dir, "--dry-run"],
        {
          encoding: "utf8",
          windowsHide: true,
          env: { ...process.env, SUPABASE_SECRET_KEY: "segredo-ficticio-de-teste" },
        },
      );
      assert.ifError(resultado.error);
      assert.equal(resultado.status, 1);
      assert.match(resultado.stderr, /somente YAML seguro/);
      assert.doesNotMatch(resultado.stdout + resultado.stderr, /segredo-ficticio-de-teste/);
      await assert.rejects(readFile(marcador), { code: "ENOENT" });
    }
    await writeFile(
      path.join(dir, "entrada.md"),
      "---yaml\nid: seguro\nautor: pedro\n---\n# Teste Authorization: Bearer opaco-de-teste",
    );
    const seguro = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/vibelog.ts", "importar-md", dir, "--dry-run"],
      { encoding: "utf8", windowsHide: true },
    );
    assert.ifError(seguro.error);
    assert.equal(seguro.status, 0, seguro.stderr);
    assert.match(seguro.stdout, /md:seguro/);
    assert.doesNotMatch(seguro.stdout, /opaco-de-teste/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("anexos textuais são redigidos pelo conteúdo em qualquer extensão", () => {
  for (const nome of [
    "script.ps1",
    "componente.tsx",
    "arquivo.desconhecido",
    "sem-extensao",
    "falso.png",
  ]) {
    const anexo = prepararEvidencia(
      nome,
      Buffer.from("sb_secret_ficticio\nAuthorization: Bearer opaco\npostgresql://:senha@host/db"),
    );
    assert.equal(anexo.mime, "text/plain; charset=utf-8");
    assert.doesNotMatch(anexo.bytes.toString(), /sb_secret_ficticio|opaco|:senha@/);
    assert.match(anexo.bytes.toString(), /REMOVID/);
  }
});

test("bloqueia arquivos de credenciais e binários que não podem ser redigidos", () => {
  for (const nome of [
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
    assert.throws(() => prepararEvidencia(nome, Buffer.from("credencial opaca")), /credenciais/);
  }
  for (const nome of ["dados.bin", "texto.txt", "falso.png"]) {
    assert.throws(() => prepararEvidencia(nome, Buffer.from([0xff, 0x00, 0x41])), /não suportado/);
  }
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  assert.deepEqual(prepararEvidencia("captura.png", png), { bytes: png, mime: "image/png" });
});
