import { useState } from "react";
import { View } from "react-native";
import { Card, Chip, Field, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { YearChooser } from "@/components/YearChooser";
import { nf, usd, yearsWord } from "@/lib/format";
import { useStore } from "@/lib/store";
import { seriesColor, useTheme } from "@/lib/theme";
import type { Env, TcoNumbers, TcoResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const SEG: [keyof TcoNumbers, string][] = [["depreciation", "Знецінення"], ["F", "Пальне"], ["M", "ТО"], ["R", "Ремонти"], ["I", "Страхування"], ["O", "Інше"], ["C", "Кредит"]];
interface ScenarioRow { label: string; per_month: number; diff_per_month: number }

export default function Tco() {
  const t = useTheme();
  const { compare, ready, years } = useStore();
  const chosen = Object.fromEntries(compare.filter((s) => years[s]).map((s) => [s, years[s]]));
  const [env, setEnv] = useState<Env>({ petrol: 58.5, diesel: 55.9, kwh: 4.32, rate: 41.6, km: 15000, years: 5, other: 250 });
  const [loan, setLoan] = useState<{ down_payment_pct: number; rate_pct: number; term_months: number } | null>(null);
  const { data, error } = useApi<TcoResponse>(ready && compare.length ? "/api/tco" : null, { method: "POST", json: { slugs: compare, env, years: chosen, credit: loan } });
  const first = compare[0];
  const scen = useApi<{ rows: ScenarioRow[] }>(ready && first ? "/api/tco/scenarios" : null,
    { method: "POST", json: { slug: first, env, year: years[first] ?? null, credit: loan } }).data;
  const segColors = [t.muted, t.c1, t.c3, t.c2, t.c4, t.line, t.bad];
  const num = (k: keyof Env) => (v: string) => { const n = parseFloat(v.replace(",", ".")); if (Number.isFinite(n) && n >= 0) setEnv({ ...env, [k]: n }); };
  const max = Math.max(1, ...(data?.results ?? []).map((r) => (r.result ? r.result.total : 0)));
  const byName = (slug: string) => data?.results.find((r) => r.slug === slug)?.name;

  return (
    <Screen>
      <T v="h1">Скільки насправді коштує авто</T>
      <Card style={{ backgroundColor: t.surface2 }}><T v="small" style={{ fontFamily: "monospace" }}>TCO = P + F + M + R + I + O − S{"\n"}F = (D × C / 100) × Q</T></Card>
      <Row>{[1, 3, 5, 10].map((y) => <Chip key={y} label={`${y} ${yearsWord(y)}`} on={env.years === y} onPress={() => setEnv({ ...env, years: y })} />)}</Row>
      <Row style={{ alignItems: "flex-start" }}>
        <Field label="Пробіг за рік, км" keyboardType="numeric" defaultValue={String(env.km)} onChangeText={num("km")} />
        <Field label="Бензин, грн/л" keyboardType="decimal-pad" defaultValue={String(env.petrol)} onChangeText={num("petrol")} />
        <Field label="Дизель, грн/л" keyboardType="decimal-pad" defaultValue={String(env.diesel)} onChangeText={num("diesel")} />
        <Field label="Електро, грн/кВт·год" keyboardType="decimal-pad" defaultValue={String(env.kwh)} onChangeText={num("kwh")} />
        <Field label="Курс, грн за $" keyboardType="decimal-pad" defaultValue={String(env.rate)} onChangeText={num("rate")} />
        <Field label="Інші витрати, $/рік" keyboardType="numeric" defaultValue={String(env.other)} onChangeText={num("other")} />
      </Row>
      {!compare.length ? <T v="muted">Додайте автомобілі до порівняння, щоб порахувати витрати.</T> : !data ? <Loading error={error} /> : (
        <>
          {data.comparison && <Notice tone="info">За {env.years} {yearsWord(env.years)} найдешевше обійдеться {byName(data.comparison.cheapest)} — на {usd(data.comparison.difference)} менше, ніж {byName(data.comparison.most_expensive)}.</Notice>}
          {data.missing.length > 0 && <Notice>Не вистачає даних для розрахунку: {data.missing.map(byName).join(", ")}.</Notice>}
          <Row>{SEG.map(([k, l], i) => <Row key={k} style={{ gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: segColors[i] }} /><T v="label">{l}</T></Row>)}</Row>
          <Card>
            <Row style={{ justifyContent: "space-between" }}><T v="h3">Кредит</T>
              <Chip label={loan ? "Купую в кредит ✓" : "Купую в кредит"} on={!!loan} onPress={() => setLoan(loan ? null : { down_payment_pct: 30, rate_pct: 18, term_months: 60 })} /></Row>
            {loan && (
              <Row style={{ alignItems: "flex-start" }}>
                <Field label="Внесок, %" keyboardType="numeric" defaultValue={String(loan.down_payment_pct)} onChangeText={(v) => { const n = Number(v); if (n >= 0 && n <= 95) setLoan({ ...loan, down_payment_pct: n }); }} />
                <Field label="Ставка, %" keyboardType="decimal-pad" defaultValue={String(loan.rate_pct)} onChangeText={(v) => { const n = Number(v.replace(",", ".")); if (n >= 0 && n <= 100) setLoan({ ...loan, rate_pct: n }); }} />
                <Field label="Строк, міс." keyboardType="numeric" defaultValue={String(loan.term_months)} onChangeText={(v) => { const n = Number(v); if (n >= 6 && n <= 120) setLoan({ ...loan, term_months: n }); }} />
              </Row>
            )}
          </Card>
          <YearChooser cars={data.results.map((r) => ({ slug: r.slug, name: r.name, year_from: r.years[0] ?? null, year_to: r.years[r.years.length - 1] ?? null, year_ref: r.year_ref }))} />
          {data.results.map((r, i) => (
            <Card key={r.slug}>
              <T v="h3" style={{ color: seriesColor(t, i) }}>{r.name}{r.year ? ` · ${r.year} р.` : ""}</T>
              {r.result ? (
                <>
                  <View style={{ flexDirection: "row", height: 18, borderRadius: 4, overflow: "hidden", backgroundColor: t.surface2 }}>
                    {SEG.map(([k], j) => <View key={k} style={{ width: `${((r.result![k] as number) / max) * 100}%`, backgroundColor: segColors[j] }} />)}
                  </View>
                  <Row style={{ justifyContent: "space-between" }}>
                    <View><T v="label">Разом</T><T v="num">{usd(r.result.total)}</T></View>
                    <View><T v="label">На місяць</T><T v="h3">{usd(r.result.per_month)}</T></View>
                    <View><T v="label">На 1 км</T><T v="h3">{nf(r.result.per_km * env.rate, 1)} грн</T></View>
                  </Row>
                  {r.result.credit && <T v="small">Кредит: {usd(r.result.credit.monthly_payment)} на місяць, відсотки за час володіння {usd(r.result.C)}</T>}
                  <T v="muted">Купівля {usd(r.result.P)} · пальне {usd(r.result.F)} · ТО {usd(r.result.M)} · ремонти {usd(r.result.R)} · страхування {usd(r.result.I)} · перепродаж −{usd(r.result.S)}{r.consumption_real ? "" : " · витрата паспортна"}</T>
                </>
              ) : <T v="muted">Немає даних для розрахунку</T>}
            </Card>
          ))}
          {scen && data.results[0] && (
            <Card>
              <T v="h3">Що буде, якщо… ({data.results[0].name})</T>
              {scen.rows.map((r) => (
                <Row key={r.label} style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <T v="small" style={{ flex: 1 }}>{r.label}</T>
                  <T v="small" style={{ fontWeight: "700", color: r.diff_per_month > 0.5 ? t.bad : r.diff_per_month < -0.5 ? t.good : t.ink }}>
                    {Math.abs(r.diff_per_month) < 0.5 ? `${usd(r.per_month)}/міс` : `${r.diff_per_month > 0 ? "+" : "−"}${usd(Math.abs(r.diff_per_month))}/міс`}</T>
                </Row>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
