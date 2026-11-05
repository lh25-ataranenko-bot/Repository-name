import { ScrollView, View } from "react-native";
import { useStore } from "@/lib/store";
import { seriesColor, useTheme } from "@/lib/theme";
import { Card, Chip, T } from "./ui";

interface Item { slug: string; name: string; year_from: number | null; year_to: number | null; year_ref: number | null }

/** One row of year buttons per car; the choice is shared by comparison and the calculator. */
export function YearChooser({ cars }: { cars: Item[] }) {
  const t = useTheme();
  const { years, setYear } = useStore();
  const withYears = cars.filter((c) => c.year_from && c.year_to);
  if (!withYears.length) return null;
  return (
    <Card>
      <T v="h3">Рік випуску для ціни</T>
      <T v="muted">Рік змінює ціну купівлі, страхування й ціну перепродажу.</T>
      {withYears.map((c, i) => (
        <View key={c.slug} style={{ gap: 4 }}>
          <T v="small" style={{ fontWeight: "700", color: seriesColor(t, i) }}>{c.name}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label={`Як у каталозі (${c.year_ref})`} on={!years[c.slug]} onPress={() => setYear(c.slug, null)} />
            {Array.from({ length: c.year_to! - c.year_from! + 1 }, (_, k) => c.year_from! + k).map((y) => (
              <Chip key={y} label={String(y)} on={years[c.slug] === y} onPress={() => setYear(c.slug, y)} />
            ))}
          </ScrollView>
        </View>
      ))}
    </Card>
  );
}
