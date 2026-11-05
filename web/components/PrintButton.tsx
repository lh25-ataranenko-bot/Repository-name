"use client";

export function PrintButton({ label = "Друкувати або зберегти PDF" }: { label?: string }) {
  return <button className="no-print" onClick={() => window.print()}>{label}</button>;
}
