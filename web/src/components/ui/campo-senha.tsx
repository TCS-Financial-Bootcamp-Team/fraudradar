"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./campo";

export function CampoSenha(props: Omit<ComponentProps<"input">, "type">) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span className="relative block">
      <Input
        {...props}
        type={visivel ? "text" : "password"}
        className={`pr-12 ${props.className ?? ""}`}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        onClick={() => setVisivel(!visivel)}
      >
        {visivel ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
