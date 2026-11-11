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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var raw = localStorage.getItem('fraudradar-theme');
    if (!raw) return;
    var data = JSON.parse(raw);
    var tokens = data.tokens;
    var isDark = data.dark;
    var el = document.documentElement;
    if (tokens && typeof tokens === 'object') {
      for (var k in tokens) {
        el.style.setProperty(k, tokens[k]);
      }
    }
    if (isDark) {
      el.classList.add('dark');
    } else if (isDark === false) {
      el.classList.remove('dark');
    }
  } catch (e) {}
})()`,
          }}
        />
      </head>
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
