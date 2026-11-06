import { router, Stack, useLocalSearchParams } from "expo-router";
import { SectionList, Pressable } from "react-native";
import { Loading, T } from "@/components/ui";
import { BODY, span } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface ModelRow { brand: string; model: string; alias?: string | null; year_from: number | null; year_to: number | null; in_production?: boolean; bodies: string[]; modifications: number }

export default function Brand() {
  const t = useTheme();
  const { name } = useLocalSearchParams<{ name: string }>();
  const { data, error } = useApi<ModelRow[]>(`/api/models?brand=${encodeURIComponent(name)}`);
  if (!data) return <Loading error={error} />;
  const sections = [
    { title: "Випускаються зараз", data: data.filter((m) => m.in_production) },
    { title: "Зняті з виробництва", data: data.filter((m) => !m.in_production) },
  ].filter((s) => s.data.length);
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <SectionList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16 }}
        sections={sections}
        keyExtractor={(m) => m.model}
        renderSectionHeader={({ section }) => <T v="h3" style={{ marginTop: 12, marginBottom: 4, backgroundColor: t.bg }}>{section.title} · {section.data.length}</T>}
        renderItem={({ item: m }) => (
          <Pressable accessibilityRole="link" style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, gap: 2 }}
            onPress={() => router.push({ pathname: "/model", params: { brand: m.brand, model: m.model } })}>
            <T style={{ fontWeight: "700" }}>{m.model}{m.alias ? ` (${m.alias})` : ""}</T>
            <T v="small">{span(m.year_from, m.year_to, m.in_production)} · {m.bodies.map((b) => BODY[b] ?? b).join(", ")} · {m.modifications ? `модифікацій: ${m.modifications}` : "характеристики ще не додані"}</T>
          </Pressable>
        )}
      />
    </>
  );
}
