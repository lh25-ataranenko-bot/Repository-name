import { router, Stack, useLocalSearchParams } from "expo-router";
import { CarRow } from "@/components/CarRow";
import { Button, Card, Loading, Notice, Screen, T } from "@/components/ui";
import { BODY, span } from "@/lib/format";
import type { Car } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface ModelPage {
  brand: string; model: string; alias?: string | null; year_from: number | null; year_to: number | null; in_production?: boolean;
  years_note?: string | null; bodies: string[]; modifications: number;
  generations_list: { generation: string; year_from: number; year_to: number; in_production?: boolean; modifications: Car[] }[];
}

/** One model: years of the whole line and, if the catalogue has them, its generations with modifications. */
export default function Model() {
  const { brand, model } = useLocalSearchParams<{ brand: string; model: string }>();
  const { data: d, error } = useApi<ModelPage>(`/api/models/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`);
  if (!d) return <Screen><Loading error={error} /></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: `${d.brand} ${d.model}` }} />
      <Card>
        <T v="h2">{d.brand} {d.model}</T>
        <T>{span(d.year_from, d.year_to, d.in_production)}{d.years_note ? ` (${d.years_note})` : ""} · {d.bodies.map((b) => BODY[b] ?? b).join(", ")}</T>
        {d.alias ? <T v="muted">Також відома як {d.alias}</T> : null}
      </Card>
      {!d.modifications ? (
        <Notice tone="info">Характеристики цієї моделі ще не додані: у довіднику є роки випуску й тип кузова. Двигуни, витрата, надійність і ціни з’являться пізніше.</Notice>
      ) : d.generations_list.slice().reverse().map((g) => (
        <Card key={g.generation}>
          <T v="h3">{d.model} {g.generation}</T>
          <T v="muted">{span(g.year_from, g.year_to, g.in_production)}</T>
          {g.modifications.map((c) => <CarRow key={c.slug} car={c} />)}
        </Card>
      ))}
      <Button title={`Усі моделі ${d.brand}`} onPress={() => router.push({ pathname: "/brand/[name]", params: { name: d.brand } })} />
    </Screen>
  );
}
