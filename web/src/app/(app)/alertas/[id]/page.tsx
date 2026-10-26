import { Suspense } from "react";
import { DetalheAlerta } from "@/features/alertas/components/detalhe-alerta";

async function Conteudo({ params }: PageProps<"/alertas/[id]">) {
  const { id } = await params;
  return <DetalheAlerta key={id} id={id} />;
}

export default function Page(props: PageProps<"/alertas/[id]">) {
  return (
    <Suspense fallback={<p role="status">Carregando alerta…</p>}>
      <Conteudo {...props} />
    </Suspense>
  );
}
