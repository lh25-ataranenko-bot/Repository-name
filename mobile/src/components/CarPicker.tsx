import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Field, Loading, T } from "./ui";

/** Search-as-you-type picker over the whole catalogue. */
export function CarPicker({ value, onChange, label = "Модифікація" }: { value: string; onChange: (car: Car) => void; label?: string }) {
  const t = useTheme();
  const { data, error } = useApi<{ items: Car[] }>("/api/cars?sort=price");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = data?.items.find((c) => c.slug === value);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.items ?? []).filter((c) => !s || `${c.brand} ${c.model} ${c.generation} ${c.name}`.toLowerCase().includes(s)).slice(0, 8);
  }, [data, q]);
  if (!data) return <Loading error={error} />;

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
          {matches.map((c) => (
            <Pressable key={c.slug} accessibilityRole="button" onPress={() => { onChange(c); setOpen(false); setQ(""); }}
              style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <T v="small" style={{ fontWeight: c.slug === value ? "800" : "500" }}>{c.brand} {c.model} {c.name}</T>
              <T v="muted">{c.generation} · {c.year_from}–{c.year_to}</T>
            </Pressable>
          ))}
          {matches.length === 0 && <T v="muted">Нічого не знайдено</T>}
        </>
      )}
    </View>
  );
}
