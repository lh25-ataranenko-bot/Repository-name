import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { CarPicker } from "@/components/CarPicker";
import { Card, Chip, Field, Loading, Notice, Pill, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { nf, usd } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Car, CheckResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const CURRENT_YEAR = 2026;

export default function Check() {
  const t = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const [form, setForm] = useState({ slug: params.slug ?? "vw-passat-b8-20tdi", year: 2017, km: 198000, price: 13900, condition: "good", vin: "WVWZZZ3CZHE000000" });
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!params.slug) return;
    api<Car>(`/api/cars/${params.slug}`).then((c) => {
      const year = c.year_ref ?? CURRENT_YEAR;
      setForm({ slug: c.slug, year, km: 15000 * (CURRENT_YEAR - year), price: c.price ?? 0, condition: "good", vin: "" });
    }).catch(() => null);
  }, [params.slug]);

  const { data, error } = useApi<CheckResponse>("/api/check", { method: "POST", json: form });
  const num = (k: "year" | "km" | "price") => (v: string) => setForm({ ...form, [k]: parseInt(v, 10) || 0 });
  const all = data ? [...data.checklist.general, ...data.checklist.specific, ...data.checklist.issues] : [];
  const doneN = all.filter((x) => done[x]).length;
  const item = (x: string) => (
    <Pressable key={x} onPress={() => setDone({ ...done, [x]: !done[x] })} accessibilityRole="checkbox" accessibilityState={{ checked: !!done[x] }}
      style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
      <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: done[x] ? t.accent : t.line, backgroundColor: done[x] ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
        {done[x] && <T style={{ color: t.accentInk, fontSize: 12, fontWeight: "800" }}>✓</T>}
      </View>
      <T v="small" style={{ flex: 1, color: done[x] ? t.muted : t.ink, textDecorationLine: done[x] ? "line-through" : "none" }}>{x}</T>
    </Pressable>
  );

  return (
    <Screen>
      <T v="muted">Оберіть модифікацію з оголошення і вкажіть рік, пробіг та ціну.</T>
      <CarPicker value={form.slug} onChange={(c) => {
        const year = c.year_ref ?? CURRENT_YEAR;
        setForm({ slug: c.slug, year, km: 15000 * (CURRENT_YEAR - year), price: c.price ?? 0, condition: "good", vin: "" });
        setDone({});
      }} />
      <Row style={{ alignItems: "flex-start" }}>
        <Field label="Рік випуску" keyboardType="numeric" value={String(form.year)} onChangeText={num("year")} />
        <Field label="Пробіг, км" keyboardType="numeric" value={String(form.km)} onChangeText={num("km")} />
        <Field label="Ціна, $" keyboardType="numeric" value={String(form.price)} onChangeText={num("price")} />
      </Row>
      <Row>{[["excellent", "Відмінний"], ["good", "Добрий"], ["needs", "Потребує вкладень"]].map(([k, l]) => <Chip key={k} label={l} on={form.condition === k} onPress={() => setForm({ ...form, condition: k })} />)}</Row>
      <Field label="VIN (необов’язково)" autoCapitalize="characters" autoCorrect={false} maxLength={20} value={form.vin} onChangeText={(vin) => setForm({ ...form, vin })} />
      {!data ? <Loading error={error} /> : (
        <>
          {data.vin && (
            <Card>
              <T v="h3">Перевірка VIN</T>
              {data.vin.errors.map((e) => <T v="small" key={e} style={{ color: t.bad }}>− {e}</T>)}
              {data.vin.notes.map((e) => <T v="muted" key={e}>· {e}</T>)}
            </Card>
          )}
          <Notice>{data.disclaimer}</Notice>
          {data.warnings.map((w) => <Notice key={w}>{w}</Notice>)}
          {data.verdict && data.market ? (
            <Card style={{ backgroundColor: { good: t.goodSoft, warn: t.warnSoft, bad: t.badSoft }[data.verdict.level], borderColor: { good: t.good, warn: t.warn, bad: t.bad }[data.verdict.level] }}>
              <Row style={{ justifyContent: "space-between" }}><T v="h2">{data.verdict.title}</T><Pill tone={data.verdict.level} text={`${data.verdict.diff_pct > 0 ? "+" : ""}${nf(data.verdict.diff_pct, 1)} %`} /></Row>
              <T v="small">{data.verdict.text}</T>
              <T v="small">Оцінка ринку: <T v="small" style={{ fontWeight: "800" }}>{usd(data.market.value)}</T> ({usd(data.market.low)}–{usd(data.market.high)})</T>
              <T v="muted">Очікуваний пробіг: {nf(data.market.expected_km)} км. Поправка за пробіг: {nf(data.market.mileage_adj * 100, 1)} %.</T>
            </Card>
          ) : <Notice>Немає даних для оцінки ціни цієї модифікації.</Notice>}
          <Card>
            <Row style={{ justifyContent: "space-between" }}><T v="h3">Чекліст огляду</T><Pill tone="info" text={`${doneN} з ${all.length}`} /></Row>
            <T v="label">Загальна перевірка</T>{data.checklist.general.map(item)}
            {data.checklist.specific.length > 0 && <><T v="label">Для цієї модифікації</T>{data.checklist.specific.map(item)}</>}
            <T v="label">Типові несправності</T>{data.checklist.issues.map(item)}
          </Card>
          <Card><T v="h3">Запитання продавцю</T>{data.checklist.questions.map((q) => <T v="small" key={q}>· {q}</T>)}</Card>
        </>
      )}
    </Screen>
  );
}
