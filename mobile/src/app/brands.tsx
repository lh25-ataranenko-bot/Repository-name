import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Field, Loading, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface BrandRow { brand: string; country: string | null; alias: string | null; models: number; models_in_production: number; models_with_specs: number }
interface ModelRow { brand: string; model: string; alias?: string | null; modifications: number }

/** All brands since 1990; typing searches models across every brand. */
export default function Brands() {
  const t = useTheme();
  const [q, setQ] = useState("");
  const brands = useApi<BrandRow[]>("/api/brands");
  const models = useApi<ModelRow[]>(q.trim().length >= 2 ? "/api/models" : null);
  const query = q.trim().toLowerCase();
  type Item = BrandRow | ModelRow;
  const found: Item[] | null = query.length >= 2 && models.data
    ? models.data.filter((m) => `${m.brand} ${m.model} ${m.alias ?? ""}`.toLowerCase().includes(query)).slice(0, 60) : null;
  if (!brands.data) return <Loading error={brands.error} />;
  const row = { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, gap: 2 } as const;
  return (
    <FlatList
      contentContainerStyle={{ padding: 16, gap: 4, backgroundColor: t.bg }}
      style={{ backgroundColor: t.bg }}
      ListHeaderComponent={<View style={{ gap: 8, marginBottom: 8 }}>
        <T v="muted">Усі марки й моделі з 1990 року. Для частини моделей уже є характеристики, ціни й надійність.</T>
        <Field label="Знайти модель" value={q} onChangeText={setQ} placeholder="Octavia, RAV4, Optima…" autoCorrect={false} />
      </View>}
      data={(found ?? brands.data) as Item[]}
      keyExtractor={(x) => ("model" in x ? `${x.brand}|${x.model}` : x.brand)}
      ListEmptyComponent={<T v="muted">Нічого не знайдено.</T>}
      renderItem={({ item }: { item: Item }) => "model" in item ? (
        <Pressable accessibilityRole="link" style={row} onPress={() => router.push({ pathname: "/model", params: { brand: item.brand, model: item.model } })}>
          <T style={{ fontWeight: "700" }}>{item.brand} {item.model}</T>
          <T v="small">{item.modifications ? `модифікацій: ${item.modifications}` : "характеристики ще не додані"}{item.alias ? ` · також ${item.alias}` : ""}</T>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="link" style={row} onPress={() => router.push({ pathname: "/brand/[name]", params: { name: item.brand } })}>
          <T style={{ fontWeight: "700" }}>{item.brand}</T>
          <T v="small">{item.country ?? "—"} · моделей: {item.models} · випускаються: {item.models_in_production} · з характеристиками: {item.models_with_specs}</T>
        </Pressable>
      )}
    />
  );
}
