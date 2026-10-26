// Teste isolado: autenticação e dados fictícios, sem contato com o Supabase real.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = "http://127.0.0.1:4011",
  app = "http://localhost:3002";
function curlStatus(caminho, cookie = "") {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "-o", "NUL", "-w", "%{http_code}"];
    if (cookie) args.push("-H", `Cookie: ${cookie}`);
    args.push(`${app}${caminho}`);
    const processo = spawn("curl.exe", args, { windowsHide: true });
    let saida = "",
      erro = "";
    processo.stdout.on("data", (d) => (saida += d));
    processo.stderr.on("data", (d) => (erro += d));
    processo.on("error", reject);
    processo.on("close", (codigo) =>
      codigo === 0 ? resolve(Number(saida)) : reject(new Error(erro)),
    );
  });
}
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const nos = ids.map((id, i) => ({
  id,
  pai_id: i ? ids[i - 1] : null,
  tipo: ["prompt_humano", "prompt_ia", "resposta"][i],
  area: ["infra", "backend", "ml"][i],
  autor: ["pedro", "claude", "codex"][i],
  titulo: ["Configurar o ambiente", "Implementar o treinamento", "Baseline treinado e validado"][i],
  conteudo:
    i === 2
      ? "## Resultado\n\nModelo validado com revisão humana.\n\n```python\nprint('validado')\n```"
      : "Construir o FraudRadar com evidências.",
  resumo: null,
  destino: null,
  modelo: i === 2 ? "Modelo de teste" : null,
  branch: i ? "feat/baseline" : null,
  commit_sha: i === 2 ? "abc1234" : null,
  origem: null,
  origem_id: `teste:${i}`,
  meta: { repo: "TCS-Financial-Bootcamp-Team/fraudradar" },
  criado_em: `2026-10-${25 + i}T10:00:00Z`,
}));
const user = {
  id: "44444444-4444-4444-8444-444444444444",
  aud: "authenticated",
  role: "authenticated",
  email: "equipe@teste.local",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-10-25T10:00:00Z",
};
const parte = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = `${parte({ alg: "HS256", typ: "JWT" })}.${parte({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200, iat: Math.floor(Date.now() / 1000), email: user.email })}.assinatura-ficticia`;
let houveEscrita = false;
let pedidosFilhos = 0;
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, base);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.end();
    return;
  }
  if (u.pathname === "/auth/v1/token" || u.pathname === "/auth/v1/signup") {
    res.end(
      JSON.stringify({
        access_token: token,
        refresh_token: "refresh-ficticio",
        expires_in: 7200,
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        token_type: "bearer",
        user,
      }),
    );
    return;
  }
  if (u.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  if (u.pathname === "/auth/v1/logout") {
    res.end("{}");
    return;
  }
  if (u.pathname.startsWith("/rest/")) {
    if (req.method !== "GET") {
      houveEscrita = true;
      res.statusCode = 403;
      res.end("{}");
      return;
    }
    let dados = u.pathname.endsWith("vibelog_evidencias")
      ? [
          {
            id: "55555555-5555-4555-8555-555555555555",
            no_id: ids[2],
            tipo: "print",
            storage_path: "fixture.png",
            url: null,
            legenda: "Evidência do baseline",
            criado_em: nos[2].criado_em,
          },
        ]
      : nos;
    for (const [k, v] of u.searchParams) {
      if (v.startsWith("eq.")) dados = dados.filter((n) => String(n[k]) === v.slice(3));
      if (v === "is.null") dados = dados.filter((n) => n[k] === null);
      if (v.startsWith("in.("))
        dados = dados.filter((n) => v.slice(4, -1).split(",").includes(n[k]));
    }
    const busca = /titulo.ilike.%(.+?)%/.exec(u.searchParams.get("or") ?? "")?.[1];
    if (busca)
      dados = dados.filter((n) =>
        (n.titulo + " " + n.conteudo).toLowerCase().includes(busca.toLowerCase()),
      );
    if (u.searchParams.has("pai_id")) pedidosFilhos++;
    const offset = Number(u.searchParams.get("offset") ?? 0),
      limit = Number(u.searchParams.get("limit") ?? 1000);
    dados = dados.slice(offset, offset + limit);
    const unico = req.headers.accept?.includes("vnd.pgrst.object");
    res.end(JSON.stringify(unico ? dados[0] : dados));
    return;
  }
  if (req.method === "POST" && u.pathname.startsWith("/storage/v1/object/sign/")) {
    res.end(
      JSON.stringify({ signedURL: "/object/sign/vibelog-evidencias/fixture.png?token=teste" }),
    );
    return;
  }
  if (u.pathname.includes("fixture.png")) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#202f4d"/><text x="60" y="260" fill="#fff" font-size="42">Baseline validado</text></svg>',
    );
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((r) => mock.listen(4011, "127.0.0.1", r));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3002"], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: base,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    VIBELOG_TEST_DIST: ".next-test",
  },
});
let log = "";
next.stdout.on("data", (d) => (log += d));
next.stderr.on("data", (d) => (log += d));
let browser;
try {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${app}/login`);
      if (r.ok) break;
    } catch {}
    if (next.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(app);
  assert.match(page.url(), /\/login/);
  assert.equal((await page.request.get(`${app}/api/registros`)).status(), 401);
  for (const [caminho, codigo] of [
    ["/", 307],
    ["/login", 200],
    ["/cadastro", 200],
    ["/api/registros", 401],
  ]) {
    assert.equal(await curlStatus(caminho), codigo, `${caminho} sem sessão`);
  }
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/login-escuro.png", fullPage: true });
  await page.getByRole("link", { name: "Criar conta" }).click();
  await page.getByRole("heading", { name: "Crie sua conta" }).waitFor();
  await page.getByLabel("Nome", { exact: true }).fill("Pessoa Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha1234");
  await page.getByLabel("Confirmar senha").fill("senha1234");
  await page.getByRole("button", { name: "Mostrar senha" }).first().click();
  assert.equal(await page.getByLabel("Senha", { exact: true }).getAttribute("type"), "text");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("heading", { name: "Registro de construção" }).waitFor();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("heading", { name: "Entre na história" }).waitFor();
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  assert.equal(await page.getByLabel("Senha", { exact: true }).getAttribute("type"), "text");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await page.getByLabel("Manter conectado").uncheck();
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await page.getByRole("button", { name: "Acessar VibeLog" }).click();
  await page.getByRole("heading", { name: "Registro de construção" }).waitFor();
  await page.locator(".react-flow__node").first().waitFor();
  const authCookies = (await page.context().cookies()).filter((c) =>
    c.name.startsWith("vibelog-auth"),
  );
  assert.ok(authCookies.length > 0);
  assert.ok(authCookies.every((c) => c.expires === -1));
  const cookieHeader = (await page.context().cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  for (const [caminho, codigo] of [
    ["/", 200],
    ["/?vista=arvore", 200],
    ["/?vista=tempo", 200],
    ["/login", 307],
    ["/cadastro", 307],
    ["/api/registros", 200],
  ]) {
    assert.equal(await curlStatus(caminho, cookieHeader), codigo, `${caminho} com sessão`);
  }
  await page.screenshot({ path: "test-results/quadro-escuro.png", fullPage: true });
  await page.locator(".canvas-card h3").filter({ hasText: nos[2].titulo }).click();
  await page.getByRole("heading", { name: nos[2].titulo, exact: true }).waitFor();
  await page.getByRole("button", { name: "Modo apresentação" }).click();
  await page.waitForURL(/apresentacao=1/);
  assert.equal(new URL(page.url()).searchParams.get("apresentacao"), "1");
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await page.screenshot({ path: "test-results/quadro-claro.png", fullPage: true });
  await page.getByRole("button", { name: "Registros", exact: true }).click();
  await page.getByRole("button", { name: "Árvore", exact: true }).click();
  await page.waitForURL(/vista=arvore/);
  assert.equal(new URL(page.url()).searchParams.get("vista"), "arvore");
  await page.locator(".tree .node-title").filter({ hasText: nos[0].titulo }).waitFor();
  assert.ok(pedidosFilhos >= 1);
  await page.getByRole("button", { name: `Expandir ${nos[0].titulo}` }).click();
  await page.getByText(nos[1].titulo, { exact: true }).waitFor();
  await page.getByRole("button", { name: `Expandir ${nos[1].titulo}` }).click();
  await page.locator(".tree .node-title").filter({ hasText: nos[2].titulo }).click();
  await page.getByRole("heading", { name: nos[2].titulo, exact: true }).waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector(".evidence-card img");
    return img?.complete && img.naturalWidth > 0;
  });
  await page.getByRole("button", { name: "Ampliar Evidência do baseline" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Fechar imagem" }).click();
  await page.screenshot({ path: "test-results/arvore-claro.png", fullPage: true });
  await page.locator(".sidebar-areas button").filter({ hasText: "Machine learning" }).click();
  await page.getByText("Ancestrais mantidos para dar contexto.").waitFor();
  await page.getByText(nos[0].titulo, { exact: true }).first().waitFor();
  await page.getByText(nos[1].titulo, { exact: true }).first().waitFor();
  assert.ok(new URL(page.url()).searchParams.get("area") === "ml");
  assert.ok(new URL(page.url()).searchParams.get("no") === ids[2]);
  await page.getByRole("button", { name: "Linha do tempo" }).click();
  await page.locator(".timeline-row").waitFor();
  assert.equal(await page.locator(".timeline-row").count(), 1);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.locator(".timeline-row").nth(2).waitFor();
  await page.getByRole("button", { name: "Árvore", exact: true }).click();
  await page.getByLabel("Buscar em títulos e conteúdo").fill("revisão humana");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByText("Ancestrais mantidos para dar contexto.").waitFor();
  await page.locator(".tree .node-title").filter({ hasText: nos[2].titulo }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "Registros", exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("heading", { name: "Entre na história" }).waitFor();
  assert.deepEqual(erros, []);
  assert.equal(houveEscrita, false);
  assert.doesNotMatch(log, /Blocking Route|prerendering|unstable value|Runtime Data/i);
  console.log(
    "Navegador: cadastro, login, cookies de sessão, quadro, árvore, filtros, detalhes, apresentação, tema, linha do tempo, busca, mobile e logout passaram; nenhuma escrita pelo viewer.",
  );
} catch (e) {
  console.error(log.slice(-4000));
  throw e;
} finally {
  if (browser) await browser.close();
  next.kill();
  await new Promise((r) => mock.close(r));
}
