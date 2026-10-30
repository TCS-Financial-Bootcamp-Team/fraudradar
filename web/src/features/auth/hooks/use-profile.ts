"use client";
import { toast } from "sonner";
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
        toast.success("Perfil atualizado.");
        resource.reload();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
