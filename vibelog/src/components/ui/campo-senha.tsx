"use client";
import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
export function CampoSenha(props: Omit<ComponentProps<"input">, "type">) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span className="relative mt-2 block">
      <input
        {...props}
        type={visivel ? "text" : "password"}
        className={`campo pr-12 ${props.className ?? ""}`}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2"
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        onClick={() => setVisivel(!visivel)}
      >
        {visivel ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
