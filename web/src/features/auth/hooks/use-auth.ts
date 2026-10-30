"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/format";
import * as authService from "../services/auth-service";
import type { SignupInput, LoginInput } from "../schemas/auth";

export function useAuth() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const navigateToDashboard = () => {
    router.replace("/dashboard");
    router.refresh();
  };
  return {
    busy,
    message,
    signIn: (data: LoginInput) =>
      runAction(async () => {
        await authService.signIn(data);
        navigateToDashboard();
      }),
    signUp: (data: SignupInput) =>
      runAction(async () => {
        if (await authService.signUp(data)) navigateToDashboard();
        else
          setMessage(
            "Confira seu e-mail para confirmar o cadastro e acessar o FraudRadar.",
          );
      }),
    requestPasswordReset: (data: { email: string }) =>
      runAction(async () => {
        await authService.requestPasswordReset(data);
        setMessage(
          "Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha.",
        );
      }),
    updatePassword: (data: { password: string; confirmation: string }) =>
      runAction(async () => {
        await authService.updatePassword(data);
        toast.success("Senha atualizada.");
        navigateToDashboard();
      }),
    signOut: () =>
      runAction(async () => {
        await authService.signOut();
        router.replace("/login");
        router.refresh();
      }),
  };
}
