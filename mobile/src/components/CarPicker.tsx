import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Pressable, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { years } from "@/lib/format";
import type { Car } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Field, Loading, T } from "./ui";

/** Search-as-you-type picker over the whole catalogue. */
export function CarPicker({ value, onChange, label = "Модифікація" }: { value: string; onChange: (car: Car) => void; label?: string }) {
  const t = useTheme();
  const selected = useApi<Car>(value ? `/api/cars/${encodeURIComponent(value)}` : null).data;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api<Car[]>(`/api/cars/lookup?${new URLSearchParams({ q, limit: "8" })}`)
      .then((m) => { setMatches(m); setError(null); }).catch((e: Error) => setError(e.message)), 200);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      {!open ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)}
          style={{ borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 10, backgroundColor: t.surface }}>
          <T v="small" style={{ fontWeight: "700" }}>{selected ? `${selected.brand} ${selected.model} ${selected.name}` : "Оберіть модифікацію"}</T>
          <T v="muted">{selected ? `${selected.generation} · змінити` : "Натисніть, щоб знайти"}</T>
        </Pressable>
      ) : (
        <>
          <Field label="Пошук: марка, модель, двигун" value={q} onChangeText={setQ} autoFocus autoCorrect={false} />
          {!matches && <Loading error={error} />}
          {matches?.map((c) => (
            <Pressable key={c.slug} accessibilityRole="button" onPress={() => { onChange(c); setOpen(false); setQ(""); }}
              style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <T v="small" style={{ fontWeight: c.slug === value ? "800" : "500" }}>{c.brand} {c.model} {c.name}</T>
              <T v="muted">{c.generation} · {years(c)}</T>
            </Pressable>
          ))}
          {matches?.length === 0 && <T v="muted">Нічого не знайдено</T>}
        </>
      )}
    </View>
  );
}
