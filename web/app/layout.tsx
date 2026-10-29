import type { Metadata, Viewport } from "next";
import { CompareTray } from "@/components/CompareTray";
import { Header } from "@/components/Header";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AutoWise", template: "%s · AutoWise" },
  description: "Порівняння конкретних модифікацій автомобілів: витрати, надійність, вартість володіння.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>
        <StoreProvider>
          <Header />
          <main className="wrap view-enter">{children}</main>
          <footer className="footer"><div className="wrap">AutoWise · Дані каталогу демонстраційні: перед публікацією їх треба замінити ліцензованими.</div></footer>
          <CompareTray />
        </StoreProvider>
      </body>
    </html>
  );
}
