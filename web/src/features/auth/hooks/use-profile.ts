"use client";
import { notify } from "@/lib/notify";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { getErrorMessage } from "@/lib/format";
import { fetchProfile, saveProfile } from "../services/auth-service";

export function useProfile() {
  const resource = useResource(fetchProfile);
  const [busy, setBusy] = useState(false);
  return {
    ...resource,
    busy,
    save: async (name: string) => {
      setBusy(true);
      try {
        await saveProfile({ name });
        notify.success("Perfil atualizado.");
        resource.reload();
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
