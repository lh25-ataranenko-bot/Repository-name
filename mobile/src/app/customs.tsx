import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Card, Chip, Field, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";

interface Money { uah: number; usd: number; eur: number }
interface Result { customs_total: Money; total: Money; lines: (Money & { key: string; label: string; how: string })[] }

export default function Customs() {
  const t = useTheme();
  const params = useLocalSearchParams<{ slug?: string; year?: string }>();
  const [form, setForm] = useState({ price: "12000", currency: "USD", delivery: "1800", year: "2018", fuel: "petrol", cc: "2000", kwh: "64", eu: false });
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.slug) return;
    api<Car>(`/api/cars/${params.slug}`).then((c) => setForm((f) => ({
      ...f, fuel: c.fuel, cc: String(c.displacement ?? f.cc), kwh: String(c.battery ?? f.kwh),
      year: String(Number(params.year) || c.year_ref || f.year), price: String(c.price_by_year?.[params.year ?? ""] ?? c.price ?? f.price),
    }))).catch(() => null);
  }, [params.slug, params.year]);

  useEffect(() => {
    const n = (v: string) => Number(v.replace(",", "."));
    const timer = setTimeout(() => {
      api<Result>("/api/customs", { method: "POST", json: {
        price: n(form.price), currency: form.currency, delivery: n(form.delivery) || 0, production_year: n(form.year), fuel: form.fuel,
        cc: form.fuel === "petrol" || form.fuel === "diesel" ? n(form.cc) : null, battery_kwh: form.fuel === "electric" ? n(form.kwh) : null,
        eu_origin: form.eu,
      } }).then((d) => { setData(d); setError(null); }).catch((e: Error) => { setData(null); setError(e.message); });
    }, 300);
    return () => clearTimeout(timer);
  }, [form]);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  return (
    <Screen>
      <T v="muted">Орієнтовне розмитнення авто зі США чи Європи: мито, акциз, ПДВ і збір до Пенсійного фонду.</T>
      <Row style={{ alignItems: "flex-start" }}>
        <Field label={`Ціна, ${form.currency === "EUR" ? "€" : "$"}`} keyboardType="numeric" value={form.price} onChangeText={set("price")} />
        <Field label="Доставка до кордону" keyboardType="numeric" value={form.delivery} onChangeText={set("delivery")} />
      </Row>
      <Row><Chip label="Долар США" on={form.currency === "USD"} onPress={() => set("currency")("USD")} /><Chip label="Євро" on={form.currency === "EUR"} onPress={() => set("currency")("EUR")} /></Row>
      <Row>{[["petrol", "Бензин"], ["diesel", "Дизель"], ["hybrid", "Гібрид"], ["electric", "Електро"]].map(([k, l]) => <Chip key={k} label={l} on={form.fuel === k} onPress={() => set("fuel")(k)} />)}</Row>
      <Row style={{ alignItems: "flex-start" }}>
        <Field label="Рік випуску" keyboardType="numeric" value={form.year} onChangeText={set("year")} />
        {(form.fuel === "petrol" || form.fuel === "diesel") && <Field label="Об’єм, см³" keyboardType="numeric" value={form.cc} onChangeText={set("cc")} />}
        {form.fuel === "electric" && <Field label="Батарея, кВт·год" keyboardType="decimal-pad" value={form.kwh} onChangeText={set("kwh")} />}
      </Row>
      <Row><Chip label="Виготовлено в ЄС, є EUR.1 (мито 0 %)" on={form.eu} onPress={() => setForm({ ...form, eu: !form.eu })} /></Row>
      {error ? <Notice>{error}</Notice> : !data ? <Loading /> : (
        <>
          <Card>
            <T v="label">Розмитнення</T>
            <T v="num">{nf(data.customs_total.uah)} грн</T>
            <T v="muted">≈ ${nf(data.customs_total.usd)} · €{nf(data.customs_total.eur)}</T>
            <T v="label" style={{ marginTop: 8 }}>Авто з доставкою й розмитненням</T>
            <T v="h2">{nf(data.total.uah)} грн</T>
          </Card>
          <Card>
            {data.lines.map((l) => (
              <View key={l.key} style={{ gap: 2, borderBottomWidth: 1, borderBottomColor: t.line, paddingBottom: 6 }}>
                <Row style={{ justifyContent: "space-between" }}><T v="small" style={{ fontWeight: "700" }}>{l.label}</T><T v="small">{nf(l.uah)} грн</T></Row>
                <T v="muted">{l.how}</T>
              </View>
            ))}
          </Card>
          <Notice>Розрахунок орієнтовний: ставки й пільги змінюються. Звірте з митною службою або брокером.</Notice>
        </>
      )}
    </Screen>
  );
}
