import { NextResponse, type NextRequest } from "next/server";
import { servidorSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get("code");
  const supabase = await servidorSupabase();
  if (codigo && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get("destino") === "recuperar"
            ? "/recuperar-senha?modo=redefinir"
            : "/dashboard",
          request.url,
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?erro=confirmacao", request.url));
}
