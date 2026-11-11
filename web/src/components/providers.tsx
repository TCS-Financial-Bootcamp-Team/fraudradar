"use client";

import { AppThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppThemeProvider>
      {children}
      <Toaster />
    </AppThemeProvider>
  );
}
