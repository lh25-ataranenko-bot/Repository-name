import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FlatList, ScrollView, View } from "react-native";
import { CarRow } from "@/components/CarRow";
import { Chip, Field, Loading, Row, T } from "@/components/ui";
import { BODY, FUEL } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Car, Facets } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const SORTS: [string, string][] = [["reliability", "Надійність"], ["price", "Ціна"], ["cost", "Вартість 100 км"], ["tco", "Володіння 5 р."], ["acc", "Розгін"]];

export default function Catalog() {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState("any");
  const [body, setBody] = useState("any");
  const [sort, setSort] = useState("reliability");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [current, setCurrent] = useState(false);
  const facets = useApi<Facets>("/api/catalog/facets").data;
  const years = facets?.year_min && facets.year_max
    ? Array.from({ length: facets.year_max - facets.year_min + 1 }, (_, i) => facets.year_max! - i) : [];
  const params = new URLSearchParams({ sort });
  if (q) params.set("q", q);
  if (fuel !== "any") params.set("fuel", fuel);
  if (body !== "any") params.set("body", body);
  if (brand) params.set("brand", brand);
  if (model) params.set("model", model);
  if (year) params.set("year", String(year));
  if (current) params.set("in_production", "true");
  params.set("limit", "30");
  const { data, error, loading, reload } = useApi<{ total: number; count: number; items: Car[] }>(`/api/cars?${params}`);
  // Further pages are appended as the list scrolls.
  const [extra, setExtra] = useState<Car[]>([]);
  const [paging, setPaging] = useState(false);
  useEffect(() => setExtra([]), [data]);
  const items = [...(data?.items ?? []), ...extra];
  const loadMore = async () => {
    if (!data || paging || items.length >= data.count) return;
    setPaging(true);
    const p = new URLSearchParams(params);
    p.set("offset", String(items.length));
    try {
      const next = await api<{ items: Car[] }>(`/api/cars?${p}`);
      setExtra((e) => [...e, ...next.items]);
    } catch {
      /* the next scroll retries */
    } finally {
      setPaging(false);
    }
  };

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={items}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={paging ? <Loading /> : undefined}
      keyExtractor={(c) => c.slug}
      renderItem={({ item }) => <CarRow car={item} />}
      refreshing={loading && !!data}
      onRefresh={reload}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Field label="Пошук" placeholder="Модель, покоління, код двигуна" value={q} onChangeText={setQ} autoCorrect={false} />
          <Chip label="Лише ті, що випускаються зараз" on={current} onPress={() => setCurrent(!current)} />
          <T v="label">Марка</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="Усі марки" on={!brand} onPress={() => { setBrand(""); setModel(""); }} />
            {Object.keys(facets?.brands ?? {}).map((b) => <Chip key={b} label={b} on={brand === b} onPress={() => { setBrand(b); setModel(""); }} />)}
          </ScrollView>
          {brand !== "" && (
            <>
              <T v="label">Модель</T>
              <Row>
                <Chip label="Усі моделі" on={!model} onPress={() => setModel("")} />
                {(facets?.brands[brand] ?? []).map((m) => <Chip key={m} label={m} on={model === m} onPress={() => setModel(m)} />)}
              </Row>
            </>
          )}
          <T v="label">Рік випуску</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="Будь-який" on={!year} onPress={() => setYear(null)} />
            {years.map((y) => <Chip key={y} label={String(y)} on={year === y} onPress={() => setYear(y)} />)}
          </ScrollView>
          {year !== null && <T v="muted">Модифікації, що випускалися у {year} році, з оцінкою ціни для цього року.</T>}
          <Row><Chip label="Будь-яке паливо" on={fuel === "any"} onPress={() => setFuel("any")} />{Object.entries(FUEL).map(([k, v]) => <Chip key={k} label={v} on={fuel === k} onPress={() => setFuel(k)} />)}</Row>
          <Row><Chip label="Будь-який кузов" on={body === "any"} onPress={() => setBody("any")} />{Object.entries(BODY).map(([k, v]) => <Chip key={k} label={v} on={body === k} onPress={() => setBody(k)} />)}</Row>
          <Row><T v="label">Сортувати:</T>{SORTS.map(([k, v]) => <Chip key={k} label={v} on={sort === k} onPress={() => setSort(k)} />)}</Row>
          {data ? <T v="muted">Знайдено: {data.count} з {data.total}</T> : <Loading error={error} />}
        </View>
      }
      ListEmptyComponent={data ? <T v="muted">Нічого не знайдено. Послабте фільтри.</T> : undefined}
    />
  );
}
