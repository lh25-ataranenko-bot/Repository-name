import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { Button, Card, Field, Pill, Row, T, useToast } from "./ui";

interface Review { id: number; author: string; rating: number; pros: string; cons: string; car_year: number | null; mileage_km: number | null }
interface Summary { count: number; average: number | null; items: Review[] }
interface Mine extends Review { slug: string; status: "pending" | "published" | "rejected"; reject_reason: string | null }

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const STATUS = { pending: ["На перевірці", "warn"], published: ["Опубліковано", "good"], rejected: ["Відхилено", "bad"] } as const;

export function Reviews({ slug }: { slug: string }) {
  const t = useTheme();
  const toast = useToast();
  const { user } = useStore();
  const [data, setData] = useState<Summary | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ rating: 0, pros: "", cons: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Summary>(`/api/cars/${slug}/reviews`).then(setData).catch(() => null);
    if (user) api<Mine[]>("/api/me/reviews").then((l) => {
      const m = l.find((r) => r.slug === slug) ?? null;
      setMine(m);
      if (m) setForm({ rating: m.rating, pros: m.pros, cons: m.cons });
    }).catch(() => null);
  }, [slug, user]);
  useEffect(load, [load]);

  const submit = async () => {
    setError(null);
    if (!form.rating) return setError("Поставте оцінку від 1 до 5.");
    try {
      await api(`/api/cars/${slug}/reviews/mine`, { method: "PUT", json: form });
      toast("Дякуємо! Відгук з’явиться після перевірки");
      setOpen(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <T v="h3">Відгуки власників</T>
        {data && data.count > 0 && <T v="small"><T v="small" style={{ color: t.needle }}>{stars(data.average!)}</T> {nf(data.average, 1)} · {data.count}</T>}
      </Row>
      {data?.count === 0 && <T v="muted">Відгуків ще немає.</T>}
      {data?.items.slice(0, 5).map((r) => (
        <View key={r.id} style={{ gap: 2, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
          <T v="small"><T v="small" style={{ color: t.needle }}>{stars(r.rating)}</T> {r.author}{r.car_year ? ` · авто ${r.car_year} р.` : ""}</T>
          {r.pros !== "" && <T v="small">+ {r.pros}</T>}
          {r.cons !== "" && <T v="small" style={{ color: t.bad }}>− {r.cons}</T>}
        </View>
      ))}
      {!user ? <T v="muted">Увійдіть у кабінеті, щоб залишити відгук.</T> : !open ? (
        <Row>
          {mine && <Pill text={`Ваш відгук: ${STATUS[mine.status][0]}`} tone={STATUS[mine.status][1]} />}
          <Button small kind={mine ? "default" : "primary"} title={mine ? "Редагувати відгук" : "Залишити відгук"} onPress={() => setOpen(true)} />
        </Row>
      ) : (
        <View style={{ gap: 8 }}>
          <Row>{[1, 2, 3, 4, 5].map((k) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: form.rating === k }} accessibilityLabel={`${k} з 5`}
              onPress={() => setForm({ ...form, rating: k })}>
              <T style={{ fontSize: 30, color: form.rating >= k ? t.needle : t.line }}>★</T>
            </Pressable>
          ))}</Row>
          <Field label="Плюси" value={form.pros} onChangeText={(pros) => setForm({ ...form, pros })} multiline maxLength={2000} />
          <Field label="Мінуси" value={form.cons} onChangeText={(cons) => setForm({ ...form, cons })} multiline maxLength={2000} />
          {error && <T style={{ color: t.bad }}>{error}</T>}
          <Row><Button kind="primary" title="Надіслати" onPress={submit} /><Button kind="ghost" title="Скасувати" onPress={() => setOpen(false)} /></Row>
          <T v="muted">Відгук публікується після перевірки модератором.</T>
        </View>
      )}
    </Card>
  );
}
