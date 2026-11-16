import { Suspense } from "react";
import { StatusText } from "@/components/ui/status-text";
import { AlertDetailView } from "@/features/alerts/components/alert-detail";

async function AlertDetailContent({ params }: PageProps<"/alerts/[id]">) {
  const { id } = await params;
  return <AlertDetailView key={id} id={id} />;
}

export default function Page(props: PageProps<"/alerts/[id]">) {
  return (
    <Suspense fallback={<StatusText message="loadingAlert" />}>
      <AlertDetailContent {...props} />
    </Suspense>
  );
}
