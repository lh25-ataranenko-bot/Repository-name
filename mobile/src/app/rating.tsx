import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Bar, Button, Card, Chip, Loading, Row, Screen, T, useToast } from "@/components/ui";
import { CATS, FUEL, PRESETS, usd, years } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { CategoryKey, Facets, Meta, RatingResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Rating() {
  const p = useLocalSearchParams<Record<string, string>>();
  const t = useTheme();
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [preset, setPreset] = useState(p.preset ?? "balanced");
  const [budget, setBudget] = useState(Number(p.max_price ?? 30000));
  const [weights, setWeights] = useState<Record<CategoryKey, number> | null>(null);
  const [editing, setEditing] = useState(false);
  const meta = useApi<Meta>("/api/meta");
  const [year, setYear] = useState<number | null>(p.year ? Number(p.year) : null);
  const facets = useApi<Facets>("/api/catalog/facets").data;
  const yearList = facets?.year_min && facets.year_max
    ? Array.from({ length: facets.year_max - facets.year_min + 1 }, (_, i) => facets.year_max! - i) : [];
  const filters = { max_price: budget, year, trans: p.trans ?? "any", drive: p.drive ?? "any", fuel: p.fuel ?? "any", body: p.body ?? "any" };
  const { data, error } = useApi<RatingResponse>("/api/rating", { method: "POST", json: weights ? { weights, filters } : { preset, filters } });
  const choosePreset = (k: string) => { setPreset(k); setWeights(null); };
  const shown = weights ?? (meta.data ? meta.data.presets[preset]?.w ?? meta.data.presets.balanced.w : null);
  const bump = (k: CategoryKey, d: number) => {
    if (!shown) return;
    setWeights({ ...shown, [k]: Math.max(0, Math.min(10, shown[k] + d)) });
  };
  const tags = p.tags ? p.tags.split("|").filter(Boolean) : [];

  return (
    <Screen>
      {tags.length > 0 && <Row><T v="label">З вашого запиту:</T>{tags.map((x) => <Chip key={x} label={x} on />)}</Row>}
      <T v="label">Пріоритет</T>
      <Row>
        {Object.entries(PRESETS).map(([k, n]) => <Chip key={k} label={n} on={!weights && preset === k} onPress={() => choosePreset(k)} />)}
        <Chip label={weights ? "Власні ваги ✓" : "Налаштувати ваги"} on={!!weights || editing} onPress={() => setEditing(!editing)} />
      </Row>
      {editing && shown && (
        <Card>
          <T v="muted">Вага 0 — категорія не враховується, 10 — найважливіша. Бюджет і обов’язкові умови все одно працюють як фільтри.</T>
          {CATS.map(([k, l]) => (
            <Row key={k} style={{ flexWrap: "nowrap", justifyContent: "space-between" }}>
              <T v="small" style={{ flex: 1 }}>{l}</T>
              <Button small title="−" accessibilityLabel={`Зменшити вагу: ${l}`} disabled={shown[k] <= 0} onPress={() => bump(k, -1)} />
              <T v="h3" style={{ width: 28, textAlign: "center" }}>{shown[k]}</T>
              <Button small title="+" accessibilityLabel={`Збільшити вагу: ${l}`} disabled={shown[k] >= 10} onPress={() => bump(k, 1)} />
            </Row>
          ))}
          {weights && <Button small kind="ghost" title="Повернути профіль" onPress={() => setWeights(null)} />}
        </Card>
      )}
      <T v="label">Бюджет: {usd(budget)}</T>
      <Row>{[15000, 20000, 25000, 30000, 40000].map((b) => <Chip key={b} label={usd(b)} on={budget === b} onPress={() => setBudget(b)} />)}</Row>
      <T v="label">Рік випуску</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="Будь-який" on={!year} onPress={() => setYear(null)} />
        {yearList.map((y) => <Chip key={y} label={String(y)} on={year === y} onPress={() => setYear(y)} />)}
      </ScrollView>
      {!data ? <Loading error={error} /> : (
        <>
          <T v="muted">Підходить: {data.matched} з {data.matched + data.excluded_total}{data.matched > data.ranked.length ? `, показано найкращі ${data.ranked.length}` : ""}. Бюджет та інші умови працюють як фільтри.</T>
          {data.ranked.map((r, i) => (
            <Card key={r.car.slug} style={i === 0 ? { borderColor: t.needle, borderWidth: 1 } : undefined}>
              <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <T v="num" style={{ color: i === 0 ? t.needle : t.muted, width: 28 }}>{i + 1}</T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="h3">{r.car.brand} {r.car.model} {r.car.name}</T>
                  <T v="muted">{years(r.car)} · {FUEL[r.car.fuel]} · {r.car.for_year ? `${usd(r.car.price_for_year ?? null)} за авто ${r.car.for_year} р.` : usd(r.car.price)}</T>
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
