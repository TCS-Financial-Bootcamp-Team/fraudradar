import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusText } from "@/components/ui/status-text";

async function RedirectToAccounts() {
  await connection();
  return redirect("/accounts");
}

export default function HomePage() {
  return (
    <Suspense fallback={<StatusText message="openingPanel" />}>
      <RedirectToAccounts />
    </Suspense>
  );
}
