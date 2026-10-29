import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Bar, Button, Card, Chip, Loading, Row, Screen, T, useToast } from "@/components/ui";
import { CATS, FUEL, PRESETS, usd, years } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { RatingResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Rating() {
  const p = useLocalSearchParams<Record<string, string>>();
  const t = useTheme();
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [preset, setPreset] = useState(p.preset ?? "balanced");
  const [budget, setBudget] = useState(Number(p.max_price ?? 30000));
  const filters = { max_price: budget, trans: p.trans ?? "any", drive: p.drive ?? "any", fuel: p.fuel ?? "any", body: p.body ?? "any" };
  const { data, error } = useApi<RatingResponse>("/api/rating", { method: "POST", json: { preset, filters } });
  const tags = p.tags ? p.tags.split("|").filter(Boolean) : [];

  return (
    <Screen>
      {tags.length > 0 && <Row><T v="label">З вашого запиту:</T>{tags.map((x) => <Chip key={x} label={x} on />)}</Row>}
      <T v="label">Пріоритет</T>
      <Row>{Object.entries(PRESETS).map(([k, n]) => <Chip key={k} label={n} on={preset === k} onPress={() => setPreset(k)} />)}</Row>
      <T v="label">Бюджет: {usd(budget)}</T>
      <Row>{[15000, 20000, 25000, 30000, 40000].map((b) => <Chip key={b} label={usd(b)} on={budget === b} onPress={() => setBudget(b)} />)}</Row>
      {!data ? <Loading error={error} /> : (
        <>
          <T v="muted">Підходить: {data.ranked.length} з {data.ranked.length + data.excluded.length}. Бюджет та інші умови працюють як фільтри.</T>
          {data.ranked.map((r, i) => (
            <Card key={r.car.slug} style={i === 0 ? { borderColor: t.needle, borderWidth: 1 } : undefined}>
              <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <T v="num" style={{ color: i === 0 ? t.needle : t.muted, width: 28 }}>{i + 1}</T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="h3">{r.car.brand} {r.car.model} {r.car.name}</T>
                  <T v="muted">{years(r.car)} · {FUEL[r.car.fuel]} · {usd(r.car.price)}</T>
                </View>
                <View style={{ alignItems: "center" }}><T v="num">{r.score ?? "—"}</T><T v="label">з 100</T></View>
              </Row>
              <View style={{ gap: 4 }}>
                {CATS.map(([k, l]) => (
                  <Row key={k} style={{ flexWrap: "nowrap" }}><T v="label" style={{ width: 120 }}>{l}</T><Bar value={r.car.scores[k]} /></Row>
                ))}
              </View>
              {r.reasons.map((x) => (
                <T v="small" key={x.text} style={{ color: x.kind === "minus" ? t.bad : x.kind === "note" ? t.muted : t.ink }}>
                  {x.kind === "plus" ? "+ " : x.kind === "minus" ? "− " : "· "}{x.text}
                </T>
              ))}
              <Row>
                <Button small title="Детальніше" onPress={() => router.push({ pathname: "/car/[slug]", params: { slug: r.car.slug } })} />
                <Button small kind={compare.includes(r.car.slug) ? "primary" : "default"} title={compare.includes(r.car.slug) ? "✓ У порівнянні" : "+ Порівняти"} onPress={() => toast(toggleCompare(r.car.slug))} />
              </Row>
            </Card>
          ))}
          {data.excluded.length > 0 && (
            <Card>
              <T v="h3">Не пройшли обов’язкові умови</T>
              {data.excluded.map((x) => <T v="small" key={x.slug}>{x.name}: <T v="muted">{x.reasons.join("; ")}</T></T>)}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
