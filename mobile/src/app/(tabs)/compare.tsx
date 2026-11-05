import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Button, Card, Loading, Notice, Row, ScoreBars, Screen, T, useToast } from "@/components/ui";
import { YearChooser } from "@/components/YearChooser";
import { api } from "@/lib/api";
import { nameOf, shortOf, usd } from "@/lib/format";
import { useStore } from "@/lib/store";
import { seriesColor, useTheme } from "@/lib/theme";
import type { CompareResult } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const COL = 150;

export default function Compare() {
  const t = useTheme();
  const toast = useToast();
  const { compare, toggleCompare, user, ready, years } = useStore();
  const chosen = Object.fromEntries(compare.filter((s) => years[s]).map((s) => [s, years[s]]));
  const { data, error } = useApi<CompareResult>(ready && compare.length >= 2 ? "/api/compare" : null, { method: "POST", json: { slugs: compare, years: chosen } });

  if (ready && compare.length < 2) {
    return (
      <Screen>
        <T v="h2">Додайте щонайменше 2 автомобілі</T>
        <T v="muted">Зараз обрано: {compare.length}. Натисніть «+ Порівняти» в каталозі або в рейтингу.</T>
        <Button kind="primary" title="Відкрити каталог" onPress={() => router.push("/catalog")} />
      </Screen>
    );
  }
  if (!data) return <Screen><Loading error={error} /></Screen>;
  const cars = data.cars;
  const save = async () => {
    if (!user) return toast("Увійдіть у кабінет, щоб зберігати порівняння");
    await api("/api/me/comparisons", { method: "POST", json: { name: cars.map((c) => c.model).join(" vs "), slugs: compare } });
    toast("Порівняння збережено");
  };
  const winner = cars.find((c) => c.slug === data.winner)!;

  return (
    <Screen>
      <Notice tone="info">За рівних ваг категорій найвищий бал у {nameOf(winner)}: {data.summary.find((s) => s.slug === data.winner)?.score}/100.</Notice>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <View style={{ width: 130 }} />
            {cars.map((c, i) => (
              <View key={c.slug} style={{ width: COL, paddingRight: 8, gap: 4 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: seriesColor(t, i) }} />
                <T v="h3" style={{ fontSize: 14 }}>{c.brand} {shortOf(c)}</T>
                <Row><Button small kind="ghost" title="Деталі" onPress={() => router.push({ pathname: "/car/[slug]", params: { slug: c.slug } })} /><Button small kind="ghost" title="×" onPress={() => toast(toggleCompare(c.slug))} /></Row>
              </View>
            ))}
          </Row>
          {data.table.map((g) => (
            <View key={g.group}>
              <T v="eyebrow" style={{ backgroundColor: t.surface2, paddingVertical: 6, paddingHorizontal: 4, marginTop: 8 }}>{g.group}</T>
              {g.rows.map((r) => (
                <Row key={r.label} style={{ flexWrap: "nowrap", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 6 }}>
                  <T v="muted" style={{ width: 130, paddingRight: 6 }}>{r.label}</T>
                  {r.values.map((v, i) => (
                    <View key={i} style={{ width: COL, paddingRight: 8, paddingVertical: 2, backgroundColor: r.best.includes(i) ? t.needleSoft : undefined, borderRadius: 4 }}>
                      <T v="small" style={{ fontWeight: r.best.includes(i) ? "700" : "400", color: v == null ? t.muted : t.ink, fontStyle: v == null ? "italic" : "normal" }}>{v ?? "Немає даних"}</T>
                    </View>
                  ))}
                </Row>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <YearChooser cars={cars.map((c) => ({ slug: c.slug, name: `${c.brand} ${shortOf(c)}`, year_from: c.year_from, year_to: c.year_to, year_ref: c.year_ref }))} />
      <Card>
        <T v="h3">Оцінки за категоріями</T>
        <Row>{cars.map((c, i) => <Row key={c.slug} style={{ gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seriesColor(t, i) }} /><T v="small">{shortOf(c)}</T></Row>)}</Row>
        <ScoreBars series={cars.map((c) => c.scores)} />
      </Card>
      <Card>
        <T v="h3">Підсумок</T>
        {data.summary.map((s, i) => (
          <View key={s.slug} style={{ gap: 2 }}>
            <T v="small" style={{ fontWeight: "700", color: seriesColor(t, i) }}>{nameOf(cars[i])} · {s.score ?? "—"}/100</T>
            {s.leads.length > 0 && <T v="small">+ Найкраще: {s.leads.join(", ")}</T>}
            {s.weak.length > 0 && <T v="small" style={{ color: t.bad }}>− Найслабше: {s.weak.join(", ")}</T>}
            <T v="muted">5 років володіння: {s.tco_5y != null ? usd(s.tco_5y) : "немає даних"}</T>
          </View>
        ))}
      </Card>
      <Row><Button title="Зберегти порівняння" onPress={save} /><Button kind="primary" title="Порахувати витрати" onPress={() => router.push("/tco")} /></Row>
    </Screen>
  );
}
