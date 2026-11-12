import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createSupabaseServerClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get("next") === "reset"
            ? "/reset-password?mode=update"
            : "/accounts",
          request.url,
        ),
      );
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", request.url),
  );
}
