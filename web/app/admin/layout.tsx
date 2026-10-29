import type { Metadata } from "next";

export const metadata: Metadata = { title: "Адмінпанель" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
