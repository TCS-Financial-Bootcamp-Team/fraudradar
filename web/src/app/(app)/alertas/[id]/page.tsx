import { DetalheAlerta } from "@/features/alertas/components/detalhe-alerta";
export default async function Page({ params }: PageProps<"/alertas/[id]">) {
  const { id } = await params;
  return <DetalheAlerta key={id} id={id} />;
}
