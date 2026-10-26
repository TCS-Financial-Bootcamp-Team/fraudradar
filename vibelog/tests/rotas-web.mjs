// Validação isolada das rotas do web em next dev, com sessão Supabase fictícia.
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = "http://localhost:3004";
const supabaseUrl = "http://127.0.0.1:4021";
const user = {
  id: "44444444-4444-4444-8444-444444444444",
  aud: "authenticated",
  role: "authenticated",
  email: "equipe@teste.local",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { nome: "Pessoa Teste" },
  created_at: "2026-10-25T10:00:00Z",
};
const parte = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const agora = Math.floor(Date.now() / 1000);
const token = `${parte({ alg: "HS256", typ: "JWT" })}.${parte({ sub: user.id, aud: "authenticated", role: "authenticated", exp: agora + 7200, iat: agora, email: user.email })}.assinatura-ficticia`;
const sessao = {
  access_token: token,
  refresh_token: "refresh-ficticio",
  expires_in: 7200,
  expires_at: agora + 7200,
  token_type: "bearer",
  user,
};
const pedidos = [];
const mock = http.createServer((req, res) => {
  pedidos.push(`${req.method} ${req.url}`);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") return res.end();
  if (req.url?.startsWith("/auth/v1/token") || req.url?.startsWith("/auth/v1/signup"))
    return res.end(JSON.stringify(sessao));
  if (req.url === "/auth/v1/user") return res.end(JSON.stringify(user));
  if (req.url?.startsWith("/auth/v1/logout")) return res.end("{}");
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((done) => mock.listen(4021, "127.0.0.1", done));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3004"], {
  cwd: resolve(raiz, "web"),
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    FRAUDRADAR_TEST_DIST: ".next-test",
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    NEXT_PUBLIC_USE_MOCKS: "true",
  },
});
let log = "";
next.stdout.on("data", (chunk) => (log += chunk));
next.stderr.on("data", (chunk) => (log += chunk));
let browser;
const rotas = [
  "/",
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/recuperar-senha?modo=redefinir",
  "/dashboard",
  "/alertas",
  "/alertas/11111111-1111-4111-8111-111111111111",
  "/comunicacoes",
  "/monitoramento",
  "/ingestao",
  "/configuracoes",
  "/auth/callback",
];
function curl(caminho, cookie = "") {
  const args = ["-sS", "-o", "NUL", "-w", "%{http_code}"];
  if (cookie) args.push("-H", `Cookie: ${cookie}`);
  args.push(`${app}${caminho}`);
  return new Promise((resolve, reject) => {
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
try {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${app}/login`);
      if (r.ok) break;
    } catch {
      /* inicia */
    }
    if (next.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const cadastro = await browser.newPage();
  await cadastro.goto(`${app}/cadastro`);
  await cadastro.getByLabel("Nome completo").fill("Pessoa Teste");
  await cadastro.getByLabel("E-mail", { exact: true }).fill(user.email);
  await cadastro.getByLabel("Senha", { exact: true }).fill("senha1234");
  await cadastro.getByLabel("Confirmar senha").fill("senha1234");
  await cadastro.getByRole("button", { name: "Mostrar senha" }).first().click();
  assert.equal(await cadastro.getByLabel("Senha", { exact: true }).getAttribute("type"), "text");
  await cadastro.getByRole("button", { name: "Criar conta", exact: true }).click();
  await cadastro.waitForURL(/\/dashboard/).catch(async (erro) => {
    console.error(
      "Cadastro:",
      cadastro.url(),
      (await cadastro.locator("body").innerText()).slice(-900),
      pedidos,
    );
    throw erro;
  });
  const persistentes = (await cadastro.context().cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  assert.ok(persistentes.length > 0 && persistentes.every((c) => c.expires > Date.now() / 1000));

  const login = await browser.newPage();
  await login.goto(`${app}/login`);
  await login.getByLabel("Manter conectado").uncheck();
  assert.equal(await login.getByLabel("Manter conectado").isChecked(), false);
  await login.getByLabel("E-mail", { exact: true }).fill(user.email);
  await login.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await login.getByRole("button", { name: "Acessar plataforma" }).click();
  await login.waitForURL(/\/dashboard/);
  const sessaoCookies = (await login.context().cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  assert.ok(sessaoCookies.length > 0 && sessaoCookies.every((c) => c.expires === -1));
  const header = (await cadastro.context().cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  for (const rota of rotas) {
    const anonimo = await curl(rota);
    const autenticado = await curl(rota, header);
    assert.ok(anonimo >= 200 && anonimo < 400, `${rota}: sem sessão ${anonimo}`);
    assert.ok(autenticado >= 200 && autenticado < 400, `${rota}: com sessão ${autenticado}`);
    if (
      [
        "/dashboard",
        "/alertas",
        "/comunicacoes",
        "/monitoramento",
        "/ingestao",
        "/configuracoes",
      ].includes(rota)
    )
      assert.equal(autenticado, 200, `${rota}: sessão não entrou`);
  }
  assert.doesNotMatch(log, /Blocking Route|encountered.*prerender|unstable value|Runtime Data/i);
  console.log(
    `Web: cadastro imediato, cookies persistentes/de sessão e ${rotas.length} rotas via curl com e sem sessão passaram; sem erro de prerender no log.`,
  );
} catch (erro) {
  console.error(log.slice(-5000));
  throw erro;
} finally {
  if (browser) await browser.close();
  next.kill();
  await new Promise((done) => mock.close(done));
}
