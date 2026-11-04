import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { FUEL, isEV, nf, usd, years } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";
import { Button, Card, ND, Row, Silhouette, T, useToast } from "./ui";

export function CarRow({ car: c, right }: { car: Car; right?: React.ReactNode }) {
  const t = useTheme();
  const { compare, toggleCompare } = useStore();
  const toast = useToast();
  const inCmp = compare.includes(c.slug);
  const cons = c.cons_real ?? c.cons_pass;
  return (
    <Pressable onPress={() => router.push({ pathname: "/car/[slug]", params: c.for_year ? { slug: c.slug, year: String(c.for_year) } : { slug: c.slug } })} accessibilityRole="link">
      <Card>
        <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="eyebrow">{c.brand} › {c.model} › {c.generation}</T>
            <T v="h3">{c.name}</T>
            <T v="muted">{years(c)} · {FUEL[c.fuel]} · {c.transmission ?? "—"}</T>
          </View>
          <Silhouette body={c.body} width={96} />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Stat label="Потужність" value={c.hp != null ? `${nf(c.hp)} к.с.` : ND} />
          <Stat label="0–100" value={c.acc != null ? `${nf(c.acc, 1)} с` : ND} />
          <Stat label={c.cons_real != null || cons == null ? "Витрата" : "Витрата (паспорт)"} value={cons != null ? `${nf(cons, 1)} ${isEV(c) ? "кВт·год" : "л"}` : ND} />
          <Stat label="Надійність" value={c.reliability != null ? `${c.reliability}/100` : ND} />
        </Row>
        <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.line, paddingTop: 10 }}>
          <View>
            <T v="num" style={{ fontSize: 19 }}>{(c.for_year ? c.price_for_year : c.price) != null ? usd(c.for_year ? c.price_for_year! : c.price!) : ND}</T>
            <T v="label">{c.for_year ? `оцінка для ${c.for_year} р.` : `ціна, ${c.year_ref ?? "—"} р.`}</T>
          </View>
          {right ?? <Button small kind={inCmp ? "primary" : "default"} title={inCmp ? "✓ У порівнянні" : "+ Порівняти"} onPress={() => toast(toggleCompare(c.slug))} />}
        </Row>
      </Card>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 70 }}>
      <T v="label">{label}</T>
      <T v="small" style={{ fontWeight: "700" }}>{value}</T>
    </View>
  );
}
