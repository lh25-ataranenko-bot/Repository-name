import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Field, T } from "./ui";

export interface Suggestion { type: "brand" | "model"; brand: string; model?: string; label: string; score: number; years?: string | null; alias?: string | null; models?: number }

/** "Марка або модель" typed in any spelling ("камри", "octvia", "бмв х5"), with suggestions to tap. */
export function NameSearch({ label = "Марка або модель", onPick }: { label?: string; onPick: (s: Suggestion) => void }) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Suggestion[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let stale = false;
    const timer = setTimeout(() => api<Suggestion[]>(`/api/suggest?${new URLSearchParams({ q, limit: "6" })}`)
      .then((h) => { if (!stale) setHits(h); }).catch(() => null), 150);
    return () => { stale = true; clearTimeout(timer); };
  }, [q]);
  return (
    <View style={{ gap: 4 }}>
      <Field label={label} placeholder="Напр. Тойота Камрі, Octavia, бмв х5" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" />
      {hits.map((h) => (
        <Pressable key={h.label} accessibilityRole="button" onPress={() => { onPick(h); setQ(""); setHits([]); }}
          style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
          <T style={{ fontWeight: "700" }}>{h.label}</T>
          <T v="small">{h.type === "brand" ? `марка · моделей: ${h.models}` : [h.alias ? `також ${h.alias}` : "", h.years ?? ""].filter(Boolean).join(" · ")}</T>
        </Pressable>
      ))}
    </View>
  );
}
