import type { Metadata } from "next";

export const metadata: Metadata = { title: "Калькулятор розмитнення", description: "Орієнтовне розмитнення авто зі США та Європи: мито, акциз, ПДВ, збір до Пенсійного фонду." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
