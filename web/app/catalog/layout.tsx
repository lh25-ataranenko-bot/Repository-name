import type { Metadata } from "next";

export const metadata: Metadata = { title: "Каталог" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
