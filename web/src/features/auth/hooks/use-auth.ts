"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/notify";
import { getErrorMessage } from "@/lib/format";
import * as authService from "../services/auth-service";
import type { SignupInput, LoginInput } from "../schemas/auth";

export function useAuth() {
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<
    "signupConfirm" | "resetSent" | ""
  >("");
  const router = useRouter();
  const t = useTranslations("auth.messages");
  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const navigateToDashboard = () => {
    router.replace("/accounts");
    router.refresh();
  };
  return {
    busy,
    message: messageKey ? t(messageKey) : "",
    signIn: (data: LoginInput) =>
      runAction(async () => {
        await authService.signIn(data);
        navigateToDashboard();
      }),
    signUp: (data: SignupInput) =>
      runAction(async () => {
        if (await authService.signUp(data)) navigateToDashboard();
        else setMessageKey("signupConfirm");
      }),
    requestPasswordReset: (data: { email: string }) =>
      runAction(async () => {
        await authService.requestPasswordReset(data);
        setMessageKey("resetSent");
      }),
    updatePassword: (data: { password: string; confirmation: string }) =>
      runAction(async () => {
        await authService.updatePassword(data);
        notify.success(t("passwordUpdated"));
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
