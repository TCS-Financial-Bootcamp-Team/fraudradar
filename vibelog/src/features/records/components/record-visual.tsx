import { MessageSquare, CornerDownRight, CheckCheck, Flag } from "lucide-react";
import type { NodeIndex } from "../schemas";
const ICONS = {
  prompt_humano: MessageSquare,
  prompt_ia: CornerDownRight,
  resposta: CheckCheck,
  marco: Flag,
};
export function TypeIcon({ type }: { type: NodeIndex["tipo"] }) {
  const Icon = ICONS[type];
  return (
    <span className={`type-icon type-${type}`}>
      <Icon size={15} />
    </span>
  );
}
export function ShortDate({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })}
    </time>
  );
}
