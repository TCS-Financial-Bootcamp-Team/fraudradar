import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Suspense } from "react";
import { StatusText } from "@/components/ui/status-text";
async function LoginFormContent({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  return (
    <AuthScreen
      mode="login"
      error={typeof query.error === "string" ? query.error : undefined}
    />
  );
}
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<StatusText message="loadingLogin" />}>
      <LoginFormContent {...props} />
    </Suspense>
  );
}
