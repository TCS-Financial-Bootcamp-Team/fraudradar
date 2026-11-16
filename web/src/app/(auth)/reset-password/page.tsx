import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Suspense } from "react";
import { StatusText } from "@/components/ui/status-text";
async function ResetPasswordContent({
  searchParams,
}: PageProps<"/reset-password">) {
  const query = await searchParams;
  return <AuthScreen mode={query.mode === "update" ? "update" : "reset"} />;
}
export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<StatusText message="loadingRecovery" />}>
      <ResetPasswordContent {...props} />
    </Suspense>
  );
}
