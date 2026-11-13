import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

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

// O idioma vem do cookie NEXT_LOCALE (dado da requisição): a raiz renderiza sob demanda,
// o que já era o caso, porque toda tela exige sessão.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.meta");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
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
        <NextIntlClientProvider>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
