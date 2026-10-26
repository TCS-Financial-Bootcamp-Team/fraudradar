import { MessageSquare, CornerDownRight, CheckCheck, Flag } from "lucide-react";
import type { Indice } from "../schemas";
const icones = {
  prompt_humano: MessageSquare,
  prompt_ia: CornerDownRight,
  resposta: CheckCheck,
  marco: Flag,
};
export function IconeTipo({ tipo }: { tipo: Indice["tipo"] }) {
  const Icone = icones[tipo];
  return (
    <span className={`tipo-icon tipo-${tipo}`}>
      <Icone size={15} />
    </span>
  );
}
export function Data({ valor }: { valor: string }) {
  return (
    <time dateTime={valor}>
      {new Date(valor).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })}
    </time>
  );
}
