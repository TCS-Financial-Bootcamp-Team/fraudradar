import { consultar } from "@/features/registros/services/servidor";
export async function GET(req: Request) {
  try {
    return Response.json(await consultar(new URL(req.url).searchParams), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const sessao = e instanceof Error && e.message === "SESSAO";
    return Response.json(
      {
        erro: sessao
          ? "Sua sessão expirou. Entre novamente."
          : "Não foi possível carregar os registros. Tente novamente.",
      },
      { status: sessao ? 401 : 400 },
    );
  }
}
