"use client";
import { notify } from "@/lib/notify";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useResource } from "@/hooks/use-resource";
import { getErrorMessage } from "@/lib/format";
import { fetchProfile, saveProfile } from "../services/auth-service";

export function useProfile() {
  const t = useTranslations("auth.messages");
  const resource = useResource(fetchProfile);
  const [busy, setBusy] = useState(false);
  return {
    ...resource,
    busy,
    save: async (name: string) => {
      setBusy(true);
      try {
        await saveProfile({ name });
        notify.success(t("profileUpdated"));
        resource.reload();
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
