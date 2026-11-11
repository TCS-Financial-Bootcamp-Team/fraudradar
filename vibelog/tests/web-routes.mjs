// Validação isolada das rotas do web em next dev, com sessão Supabase fictícia.
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = "http://localhost:3004";
const supabaseUrl = "http://127.0.0.1:4021";
const user = {
  id: "44444444-4444-4444-8444-444444444444",
  aud: "authenticated",
  role: "authenticated",
  email: "equipe@teste.local",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Pessoa Teste" },
  created_at: "2026-10-25T10:00:00Z",
};
const encodePart = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = `${encodePart({ alg: "HS256", typ: "JWT" })}.${encodePart({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 7200, iat: now, email: user.email })}.assinatura-ficticia`;
const authSession = {
  access_token: token,
  refresh_token: "refresh-ficticio",
  expires_in: 7200,
  expires_at: now + 7200,
  token_type: "bearer",
  user,
};
const requests = [];
const mock = http.createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") return res.end();
  if (req.url?.startsWith("/auth/v1/token") || req.url?.startsWith("/auth/v1/signup"))
    return res.end(JSON.stringify(authSession));
  if (req.url === "/auth/v1/user") return res.end(JSON.stringify(user));
  if (req.url?.startsWith("/auth/v1/logout")) return res.end("{}");
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((done) => mock.listen(4021, "127.0.0.1", done));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3004"], {
  cwd: resolve(rootDir, "web"),
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
const routes = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password?mode=update",
  "/dashboard",
  "/alerts",
  "/alerts/11111111-1111-4111-8111-111111111111",
  "/monitoring",
  "/ingestion",
  "/settings",
  "/auth/callback",
];
function curl(routePath, cookie = "") {
  const args = ["-sS", "-o", "NUL", "-w", "%{http_code}"];
  if (cookie) args.push("-H", `Cookie: ${cookie}`);
  args.push(`${app}${routePath}`);
  return new Promise((resolve, reject) => {
    const proc = spawn("curl.exe", args, { windowsHide: true });
    let stdout = "",
      stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Number(stdout)) : reject(new Error(stderr))));
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
  const signupPage = await browser.newPage();
  await signupPage.goto(`${app}/signup`);
  await signupPage.getByLabel("Nome completo").fill("Pessoa Teste");
  await signupPage.getByLabel("E-mail", { exact: true }).fill(user.email);
  await signupPage.getByLabel("Senha", { exact: true }).fill("senha1234");
  await signupPage.getByLabel("Confirmar senha").fill("senha1234");
  await signupPage.getByRole("button", { name: "Mostrar senha" }).first().click();
  assert.equal(await signupPage.getByLabel("Senha", { exact: true }).getAttribute("type"), "text");
  await signupPage.getByRole("button", { name: "Criar conta", exact: true }).click();
  await signupPage.waitForURL(/\/dashboard/).catch(async (err) => {
    console.error(
      "Cadastro:",
      signupPage.url(),
      (await signupPage.locator("body").innerText()).slice(-900),
      requests,
    );
    throw err;
  });
  const persistentCookies = (await signupPage.context().cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  assert.ok(
    persistentCookies.length > 0 && persistentCookies.every((c) => c.expires > Date.now() / 1000),
  );

  const loginPage = await browser.newPage();
  await loginPage.goto(`${app}/login`);
  await loginPage.getByLabel("Manter conectado").uncheck();
  assert.equal(await loginPage.getByLabel("Manter conectado").isChecked(), false);
  await loginPage.getByLabel("E-mail", { exact: true }).fill(user.email);
  await loginPage.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await loginPage.getByRole("button", { name: "Acessar plataforma" }).click();
  await loginPage.waitForURL(/\/dashboard/);
  const sessionCookies = (await loginPage.context().cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  assert.ok(sessionCookies.length > 0 && sessionCookies.every((c) => c.expires === -1));
  const header = (await signupPage.context().cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  for (const route of routes) {
    const anonymousStatus = await curl(route);
    const authenticatedStatus = await curl(route, header);
    assert.ok(
      anonymousStatus >= 200 && anonymousStatus < 400,
      `${route}: sem sessão ${anonymousStatus}`,
    );
    assert.ok(
      authenticatedStatus >= 200 && authenticatedStatus < 400,
      `${route}: com sessão ${authenticatedStatus}`,
    );
    if (
      ["/dashboard", "/alerts", "/monitoring", "/ingestion", "/settings"].includes(
        route,
      )
    )
      assert.equal(authenticatedStatus, 200, `${route}: sessão não entrou`);
  }
  assert.doesNotMatch(log, /Blocking Route|encountered.*prerender|unstable value|Runtime Data/i);
  console.log(
    `Web: cadastro imediato, cookies persistentes/de sessão e ${routes.length} rotas via curl com e sem sessão passaram; sem erro de prerender no log.`,
  );
} catch (err) {
  console.error(log.slice(-5000));
  throw err;
} finally {
  if (browser) await browser.close();
  next.kill();
  await new Promise((done) => mock.close(done));
}
