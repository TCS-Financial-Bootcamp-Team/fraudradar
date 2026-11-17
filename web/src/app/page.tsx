import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusText } from "@/components/ui/status-text";

async function RedirectToDashboard() {
  await connection();
  return redirect("/dashboard");
}

export default function HomePage() {
  return (
    <Suspense fallback={<StatusText message="openingPanel" />}>
      <RedirectToDashboard />
    </Suspense>
  );
}
