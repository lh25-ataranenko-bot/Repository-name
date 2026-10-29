import type { Metadata } from "next";

export const metadata: Metadata = { title: "Калькулятор вартості володіння" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
