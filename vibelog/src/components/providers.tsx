"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}
export function Tema() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun size={18} className="hidden dark:block" />
      <Moon size={18} className="dark:hidden" />
    </Button>
  );
}
