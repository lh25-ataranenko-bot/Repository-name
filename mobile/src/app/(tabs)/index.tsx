import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Card, Chip, Field, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { PRESETS } from "@/lib/format";

interface Parsed { filters: Record<string, string | number>; preset: string | null; tags: string[] }

export default function Home() {
  const [q, setQ] = useState("кросовер до 25 тис $ з автоматом для сім'ї");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api<Parsed>("/api/search/parse", { method: "POST", json: { q } }).then(setParsed).catch(() => setParsed(null)), 300);
    return () => clearTimeout(t);
  }, [q]);

  const go = (filters: Record<string, string | number>, preset: string, tags: string[] = []) =>
    router.push({ pathname: "/rating", params: { ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)])), preset, tags: tags.join("|") } });

  return (
    <Screen>
      <T v="eyebrow">Порівняння конкретних модифікацій</T>
      <T v="h1">Оберіть авто за фактами, а не за враженнями</T>
      <T v="muted">Опишіть, що шукаєте. Ми перетворимо запит на фільтри й покажемо рейтинг з поясненнями.</T>
      <Card>
        <Field label="Яке авто шукаєте" value={q} onChangeText={setQ} maxLength={500} returnKeyType="search"
          onSubmitEditing={() => parsed && go(parsed.filters, parsed.preset ?? "balanced", parsed.tags)} />
        <Row>
          {parsed?.tags.length ? parsed.tags.map((t) => <Chip key={t} label={t} on />) : <T v="muted">Поки нічого не розпізнано</T>}
        </Row>
        <Button kind="primary" title="Підібрати" disabled={!parsed} onPress={() => parsed && go(parsed.filters, parsed.preset ?? "balanced", parsed.tags)} />
      </Card>
      <Card>
        <T v="h3">AI-помічник</T>
        <T v="muted">Поставте запитання своїми словами: порівняння, витрати, типові несправності. Відповідь — лише за даними каталогу.</T>
        <Button title="Запитати помічника" onPress={() => router.push("/assistant")} />
      </Card>
      <Card>
        <T v="h3">Марки й моделі</T>
        <T v="muted">Усі моделі з 1990 року: роки випуску, тип кузова, а де є — модифікації з характеристиками.</T>
        <Button title="Відкрити довідник" onPress={() => router.push("/brands")} />
      </Card>
      <Card>
        <T v="h3">Розмитнення</T>
        <T v="muted">Скільки коштуватиме ввезти авто зі США чи Європи: мито, акциз, ПДВ.</T>
        <Button title="Порахувати розмитнення" onPress={() => router.push("/customs")} />
      </Card>
      <T v="h2">Швидкий старт</T>
      <Row>
        {Object.entries(PRESETS).map(([k, name]) => <Chip key={k} label={name} onPress={() => go({ max_price: 30000 }, k)} />)}
      </Row>
      <Card>
        <T v="h3">Перевірити оголошення</T>
        <T v="muted">Ціна відносно ринку, перевірка VIN і чекліст огляду для конкретної модифікації.</T>
        <Button title="Відкрити аналіз оголошення" onPress={() => router.push("/check")} />
      </Card>
    </Screen>
  );
}
