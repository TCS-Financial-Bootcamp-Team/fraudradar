import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Suspense } from "react";
async function ResetPasswordContent({
  searchParams,
}: PageProps<"/reset-password">) {
  const query = await searchParams;
  return <AuthScreen mode={query.mode === "update" ? "update" : "reset"} />;
}
export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<p role="status">Carregando recuperação…</p>}>
      <ResetPasswordContent {...props} />
    </Suspense>
  );
}
