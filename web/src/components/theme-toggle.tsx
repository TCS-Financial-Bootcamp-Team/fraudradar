"use client";

import { useAppTheme } from "@/components/theme";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string } = {}) {
  const { isDark, setConfig } = useAppTheme();
  const t = useTranslations("shell.header");

  const handleToggle = () => {
    setConfig((prev) => ({
      ...prev,
      mode: isDark ? "grafite" : "escuro",
    }));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={t("toggleTheme")}
      onClick={handleToggle}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
