import { useState } from "react";
import { FlatList, View } from "react-native";
import { CarRow } from "@/components/CarRow";
import { Chip, Field, Loading, Row, T } from "@/components/ui";
import { BODY, FUEL } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const SORTS: [string, string][] = [["reliability", "Надійність"], ["price", "Ціна"], ["cost", "Вартість 100 км"], ["tco", "Володіння 5 р."], ["acc", "Розгін"]];

export default function Catalog() {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState("any");
  const [body, setBody] = useState("any");
  const [sort, setSort] = useState("reliability");
  const params = new URLSearchParams({ sort });
  if (q) params.set("q", q);
  if (fuel !== "any") params.set("fuel", fuel);
  if (body !== "any") params.set("body", body);
  const { data, error, loading, reload } = useApi<{ total: number; count: number; items: Car[] }>(`/api/cars?${params}`);

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={data?.items ?? []}
      keyExtractor={(c) => c.slug}
      renderItem={({ item }) => <CarRow car={item} />}
      refreshing={loading && !!data}
      onRefresh={reload}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Field label="Пошук" placeholder="Модель, покоління, код двигуна" value={q} onChangeText={setQ} autoCorrect={false} />
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
