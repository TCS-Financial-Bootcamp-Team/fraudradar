import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { LoadingState } from "@/components/ui/states";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FraudRadar PLD",
  description: "Monitoramento antilavagem sobre o SAML-D",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Suspense
            fallback={
              <main className="p-8">
                <LoadingState />
              </main>
            }
          >
            {children}
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
