"use client";
import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
export function PasswordField(props: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative mt-2 block">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`field pr-12 ${props.className ?? ""}`}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
