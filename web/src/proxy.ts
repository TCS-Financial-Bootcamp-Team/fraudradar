import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configuracaoSupabase } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const config = configuracaoSupabase();
  const caminho = request.nextUrl.pathname;
  const publica = [
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/auth/callback",
  ].includes(caminho);
  const redirecionar = (destino: string) => {
    const redirecionamento = NextResponse.redirect(
      new URL(destino, request.url),
    );
    resposta.cookies
      .getAll()
      .forEach((cookie) => redirecionamento.cookies.set(cookie));
    redirecionamento.headers.set("Cache-Control", "private, no-store");
    return redirecionamento;
  };
  if (!config) return publica ? resposta : redirecionar("/login");
  const supabase = createServerClient(config.url, config.chave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (valores) => {
        valores.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        valores.forEach(({ name, value, options }) =>
          resposta.cookies.set(name, value, options),
        );
      },
    },
  });
  try {
    const { data, error } = await supabase.auth.getClaims();
    if ((!data?.claims || error) && !publica) return redirecionar("/login");
    if (data?.claims && !error && ["/login", "/cadastro"].includes(caminho))
      return redirecionar("/dashboard");
  } catch {
    if (!publica) return redirecionar("/login?erro=sessao");
  }
  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
