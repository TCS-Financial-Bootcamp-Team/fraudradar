import { queryRecords } from "@/features/records/services/server";
export async function GET(req: Request) {
  try {
    return Response.json(await queryRecords(new URL(req.url).searchParams), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const expired = e instanceof Error && e.message === "SESSION";
    return Response.json(
      {
        error: expired
          ? "Sua sessão expirou. Entre novamente."
          : "Não foi possível carregar os registros. Tente novamente.",
      },
      { status: expired ? 401 : 400 },
    );
  }
}
