import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { Image, ScrollView, View } from "react-native";
import { Button, Card, Chip, Loading, Pill, Row, ScoreBars, Screen, Silhouette, T, useToast } from "@/components/ui";
import { ASSIST, BODY, DRIVE, FUEL, STATUS, consUnit, isEV, nameOf, nf, usd, years } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Reviews } from "@/components/Reviews";

export default function CarScreen() {
  const { slug, year: yearParam } = useLocalSearchParams<{ slug: string; year?: string }>();
  const [year, setYear] = useState<number | null>(yearParam ? Number(yearParam) : null);
  const t = useTheme();
  const toast = useToast();
  const { compare, toggleCompare, favs, toggleFav } = useStore();
  const { data: c, error } = useApi<Car>(`/api/cars/${encodeURIComponent(slug)}`);
  useEffect(() => { api(`/api/cars/${encodeURIComponent(slug)}/view`, { method: "POST" }).catch(() => null); }, [slug]);
  const family = useApi<{ generations_list: { generation: string; year_from: number; year_to: number; modifications: Car[] }[] }>(
    c ? `/api/models/${encodeURIComponent(c.brand)}/${encodeURIComponent(c.model)}` : null).data;
  if (!c) return <Screen><Loading error={error} /></Screen>;
  const st = STATUS[c.status] ?? STATUS.unverified;
  const v = (x: number | null, u = "", d = 0) => (x != null ? `${nf(x, d)}${u ? " " + u : ""}` : "Немає даних");
  const section = (title: string, rows: [string, string][]) => (
    <Card>
      <T v="h3">{title}</T>
      {rows.map(([k, val]) => (
        <Row key={k} style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <T v="muted" style={{ flex: 1 }}>{k}</T>
          <T v="small" style={{ fontWeight: "600", color: val === "Немає даних" ? t.muted : t.ink, textAlign: "right", flexShrink: 1 }}>{val}</T>
        </Row>
      ))}
    </Card>
  );
  const inCmp = compare.includes(c.slug);
  const fav = favs.includes(c.slug);

  return (
    <Screen>
      <Stack.Screen options={{ title: `${c.model} ${c.name}` }} />
      <T v="eyebrow">{c.brand} › {c.model} › {c.generation}</T>
      <T v="h1">{nameOf(c)}</T>
      <T v="muted">{years(c)} · {FUEL[c.fuel]} · {BODY[c.body]} · {DRIVE[c.drive]} привід</T>
      {c.photo ? (
        <View style={{ gap: 4 }}>
          <Image source={{ uri: API_BASE + c.photo.url }} style={{ width: "100%", aspectRatio: c.photo.width / c.photo.height, borderRadius: 10 }} accessibilityLabel={nameOf(c)} />
          <T v="muted">Фото: {c.photo.author} · {c.photo.license}</T>
        </View>
      ) : <View style={{ alignItems: "center" }}><Silhouette body={c.body} width={260} /></View>}
      <Row><Pill text={st[0]} tone={st[1] as "good"} /><T v="muted">{c.source ?? "—"} · {c.updated_at ?? "—"}</T></Row>
      <Row>
        <Button kind={inCmp ? "primary" : "default"} title={inCmp ? "✓ У порівнянні" : "+ Порівняти"} onPress={() => toast(toggleCompare(c.slug))} />
        <Button title={fav ? "★ В обраному" : "☆ В обране"} onPress={() => { toggleFav(c.slug); toast(fav ? "Прибрано з обраного" : "Додано в обране"); }} />
        <Button title="Перевірити оголошення" onPress={() => router.push({ pathname: "/check", params: year ? { slug: c.slug, year: String(year) } : { slug: c.slug } })} />
        <Button title="Розмитнення" onPress={() => router.push({ pathname: "/customs", params: year ? { slug: c.slug, year: String(year) } : { slug: c.slug } })} />
      </Row>
      {(c.years?.length ?? 0) > 0 && (
        <Card>
          <T v="h3">Ціна за роком випуску</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {c.years!.map((y) => <Chip key={y} label={String(y)} on={(year ?? c.year_ref) === y} onPress={() => setYear(y)} />)}
          </ScrollView>
          <T v="small">Орієнтовна ціна авто {year ?? c.year_ref} року: <T v="small" style={{ fontWeight: "800" }}>{usd(c.price_by_year?.[String(year ?? c.year_ref)] ?? null)}</T></T>
          <T v="muted">Розраховано від ціни {c.year_ref} р. зі знеціненням за рік.</T>
        </Card>
      )}
      <Row style={{ justifyContent: "space-between" }}>
        <View><T v="label">Ціна ({year ?? c.year_ref} р.)</T><T v="num">{usd(year ? c.price_by_year?.[String(year)] ?? null : c.price)}</T></View>
        <View><T v="label">100 км</T><T v="num">{c.cost_per_100km != null ? `$${nf(c.cost_per_100km, 2)}` : "—"}</T></View>
        <View><T v="label">5 років</T><T v="num">{usd(c.tco_5y)}</T></View>
      </Row>
      {(() => {
        const y = year ?? c.year_ref;
        const p = y ? c.price_by_year?.[String(y)] : null;
        if (!p || c.depreciation == null) return null;
        const at = (n: number) => p * Math.pow(1 - c.depreciation!, n);
        return (
          <Card>
            <T v="h3">Прогноз вартості</T>
            <T v="muted">Якщо купити авто {y} року зараз за {usd(p)}:</T>
            <Row style={{ justifyContent: "space-between" }}>
              {[3, 5, 10].map((n) => <View key={n}><T v="label">через {n} р.</T><T v="h3">{usd(at(n))}</T></View>)}
            </Row>
          </Card>
        );
      })()}
      <Card><T v="h3">Оцінки</T><ScoreBars series={[c.scores]} /></Card>
      {section("Двигун і трансмісія", [["Код двигуна", c.engine_code ?? "Немає даних"], ["Об’єм", c.displacement != null ? `${nf(c.displacement)} см³` : isEV(c) ? "— (електро)" : "Немає даних"], ["Потужність", v(c.hp, "к.с.")], ["Момент", v(c.torque, "Н·м")], ["КПП", c.transmission ?? "Немає даних"]])}
      {section("Динаміка й економічність", [["0–100 км/год", v(c.acc, "с", 1)], ["Макс. швидкість", v(c.vmax, "км/год")], ["Витрата (паспорт)", v(c.cons_pass, consUnit(c), 1)], ["Витрата (реальна)", v(c.cons_real, consUnit(c), 1)], ["Запас ходу", v(c.range_km, "км")]])}
      {section("Габарити й безпека", [["Багажник", v(c.trunk, "л")], ["Кліренс", v(c.clearance, "мм")], ["Euro NCAP", c.ncap != null ? `${"★".repeat(c.ncap)} (${c.ncap_year})` : "Немає даних"], ["Асистенти", c.assists.map((a) => ASSIST[a] ?? a).join(", ") || "Немає даних"]])}
      {family && family.generations_list.reduce((n, g) => n + g.modifications.length, 0) > 1 && (
        <Card>
          <T v="h3">Інші версії {c.model}</T>
          {family.generations_list.slice().reverse().map((g) => (
            <View key={g.generation} style={{ gap: 4 }}>
              <T v="label">{g.generation} · {g.year_from}–{g.year_to}</T>
              <Row>{g.modifications.map((m) => (
                <Chip key={m.slug} label={m.name} on={m.slug === c.slug}
                  onPress={() => m.slug !== c.slug && router.push({ pathname: "/car/[slug]", params: { slug: m.slug } })} />
              ))}</Row>
            </View>
          ))}
        </Card>
      )}
      <Reviews slug={c.slug} />
      <Card>
        <T v="h3">Типові несправності</T>
        {c.issues.length ? c.issues.map((i) => (
          <Row key={i.part} style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
            <View style={{ flex: 1 }}><T v="small">{i.part}</T><T v="label">{i.frequency}</T></View>
            <T v="small" style={{ fontWeight: "700" }}>{i.cost ? usd(i.cost) : "—"}</T>
          </Row>
        )) : <T v="muted">Немає даних</T>}
        <T v="muted">Упевненість в оцінці надійності: {c.reliability_confidence ?? "—"}</T>
      </Card>
    </Screen>
  );
}
