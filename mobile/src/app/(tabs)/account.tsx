import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { CarPicker } from "@/components/CarPicker";
import { CarRow } from "@/components/CarRow";
import { Button, Card, Chip, Field, Loading, Notice, Row, Screen, T, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useGarage } from "@/lib/garage";
import { scheduleServiceReminders } from "@/lib/serviceReminders";
import { nf } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { Car, GarageCar, User } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const TYPES: Record<string, string> = { fuel: "Заправка", service: "ТО", repair: "Ремонт", other: "Інше" };

function Auth() {
  const t = useTheme();
  const toast = useToast();
  const { signIn } = useStore();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (mode === "forgot") {
      try {
        await api("/api/auth/forgot", { method: "POST", json: { email } });
        setSent(true);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    try {
      const r = await api<{ token: string; user: User }>(`/api/auth/${mode}`, { method: "POST", json: mode === "login" ? { email, password } : { email, password, name } });
      await signIn(r.token, r.user);
      toast(mode === "login" ? "Ви увійшли" : "Обліковий запис створено");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Card>
      <Row><Chip label="Вхід" on={mode === "login"} onPress={() => setMode("login")} /><Chip label="Реєстрація" on={mode === "register"} onPress={() => setMode("register")} /></Row>
      {mode === "forgot" && <T v="muted">Вкажіть пошту облікового запису. Ми надішлемо посилання для нового пароля; відкрийте його на телефоні чи комп’ютері. Посилання діє 1 годину.</T>}
      {mode === "register" && <Field label="Ім’я" value={name} onChangeText={setName} />}
      <Field label="Пошта" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {mode !== "forgot" && <Field label={mode === "register" ? "Пароль (щонайменше 8 символів)" : "Пароль"} value={password} onChangeText={setPassword} secureTextEntry />}
      {error && <T style={{ color: t.bad }}>{error}</T>}
      {mode === "forgot" && sent ? (
        <T v="small">Якщо обліковий запис з адресою {email} існує, лист уже в дорозі. Перевірте також папку «Спам».</T>
      ) : (
        <Button kind="primary" title={mode === "login" ? "Увійти" : mode === "register" ? "Створити обліковий запис" : "Надіслати посилання"} onPress={submit} />
      )}
      {mode === "login" && <Button kind="ghost" small title="Забули пароль?" onPress={() => { setMode("forgot"); setSent(false); }} />}
      {mode === "forgot" && <Button kind="ghost" small title="Повернутися до входу" onPress={() => setMode("login")} />}
    </Card>
  );
}

function Profile() {
  const t = useTheme();
  const toast = useToast();
  const { user, updateUser, signIn } = useStore();
  const [name, setName] = useState(user?.name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const saveName = async () => {
    updateUser(await api<User>("/api/me", { method: "PATCH", json: { name } }));
    toast("Ім’я збережено");
  };
  const changePassword = async () => {
    setError(null);
    if (next.length < 8) return setError("Новий пароль має містити щонайменше 8 символів.");
    try {
      const r = await api<{ token: string; user: User }>("/api/me/password", { method: "POST", json: { current, new: next } });
      await signIn(r.token, r.user);
      setCurrent("");
      setNext("");
      toast("Пароль змінено. Інші пристрої вийшли з облікового запису.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">Профіль і безпека</T>
      {!user.email_verified && (
        <Notice>
          Пошту {user.email} ще не підтверджено. Без цього не вийде відновити пароль.{"\n"}
          <T v="small" style={{ color: t.accent, fontWeight: "700" }} onPress={async () => { await api("/api/auth/resend-verification", { method: "POST" }); toast("Лист надіслано"); }}>Надіслати лист ще раз</T>
        </Notice>
      )}
      <Card>
        <Field label="Ім’я" value={name} onChangeText={setName} maxLength={120} />
        <Button title="Зберегти ім’я" disabled={name === user.name} onPress={saveName} />
      </Card>
      <Card>
        <T v="h3">Зміна пароля</T>
        <Field label="Поточний пароль" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Новий пароль (щонайменше 8 символів)" value={next} onChangeText={setNext} secureTextEntry />
        {error && <T style={{ color: t.bad }}>{error}</T>}
        <Button title="Змінити пароль" disabled={!current || !next} onPress={changePassword} />
        <T v="muted">Після зміни пароля всі інші пристрої вийдуть з облікового запису.</T>
      </Card>
    </View>
  );
}

function Garage() {
  const t = useTheme();
  const toast = useToast();
  const { user } = useStore();
  const garage = useGarage(user?.id);
  const [slug, setSlug] = useState("skoda-octavia-a7-16tdi");
  const [name, setName] = useState("");
  const [km, setKm] = useState("150000");
  const [entry, setEntry] = useState<Record<number, { type: string; cost: string; km: string; note: string }>>({});
  useFocusEffect(useCallback(() => { garage.sync(); }, [garage.sync]));
  useEffect(() => { if (garage.cars && !garage.offline) scheduleServiceReminders(garage.cars); }, [garage.cars, garage.offline]);

  const add = async () => {
    try {
      await api("/api/me/garage", { method: "POST", json: { slug, name: name || "Моє авто", start_km: parseInt(km, 10) || 0 } });
      setName("");
      toast("Авто додано в гараж");
      garage.reload();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 0 ? "Без мережі нове авто додати не вийде. Записи для наявних авто працюють офлайн." : (e as Error).message);
    }
  };
  const addEntry = async (g: GarageCar) => {
    const e = entry[g.id] ?? { type: "fuel", cost: "", km: "", note: "" };
    const cost = parseFloat(e.cost.replace(",", "."));
    if (!Number.isFinite(cost) || cost < 0) return toast("Вкажіть суму");
    try {
      const how = await garage.addEntry(g.id, {
        date: new Date().toISOString().slice(0, 10), type: e.type, cost_uah: cost, km: parseInt(e.km, 10) || g.current_km, note: e.note,
      });
      setEntry({ ...entry, [g.id]: { type: e.type, cost: "", km: "", note: "" } });
      toast(how === "sent" ? "Запис додано" : "Немає мережі. Запис збережено на телефоні й надішлеться пізніше");
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">Мій гараж</T>
      {garage.offline && <Notice>Немає зв’язку із сервером. Показано збережені на телефоні дані.</Notice>}
      {garage.pending > 0 && (
        <Notice tone="info">
          Не надіслано записів: {garage.pending}. Вони надішлються, щойно з’явиться мережа.{"\n"}
          <T v="small" style={{ color: t.accent, fontWeight: "700" }} onPress={() => garage.sync()}>{garage.syncing ? "Надсилаємо…" : "Надіслати зараз"}</T>
        </Notice>
      )}
      {garage.notice && <Notice tone="info">{garage.notice}{"\n"}<T v="small" style={{ color: t.accent }} onPress={garage.clearNotice}>Зрозуміло</T></Notice>}
      <Card>
        <CarPicker value={slug} onChange={(c) => setSlug(c.slug)} />
        <Row style={{ alignItems: "flex-start" }}>
          <Field label="Назва" placeholder="Робоча Октавія" value={name} onChangeText={setName} />
          <Field label="Пробіг, км" keyboardType="numeric" value={km} onChangeText={setKm} />
        </Row>
        <Button kind="primary" title="Додати в гараж" onPress={add} />
      </Card>
      {!garage.cars ? <Loading error={garage.error} /> : garage.cars.length === 0 ? <T v="muted">Гараж порожній. Додайте авто, щоб вести облік заправок, ТО і ремонтів.</T> : garage.cars.map((g) => {
        const e = entry[g.id] ?? { type: "fuel", cost: "", km: "", note: "" };
        const set = (patch: Partial<typeof e>) => setEntry({ ...entry, [g.id]: { ...e, ...patch } });
        return (
          <Card key={g.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}><T v="h3">{g.name}</T><T v="muted">{g.modification?.name ?? "—"}</T></View>
              {!garage.offline && <Button small kind="ghost" title="Видалити" onPress={async () => { await api(`/api/me/garage/${g.id}`, { method: "DELETE" }); garage.reload(); }} />}
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <View><T v="label">Витрачено</T><T v="h3">{nf(g.total_uah)} грн</T></View>
              <View><T v="label">Пройдено</T><T v="h3">{nf(g.driven_km)} км</T></View>
              <View><T v="label">1 км</T><T v="h3">{g.per_km_uah != null ? `${nf(g.per_km_uah, 2)} грн` : "—"}</T></View>
            </Row>
            {g.service && (
              <Notice tone={g.service.status === "ok" ? "info" : "warn"}>
                {g.service.status === "overdue" ? "ТО прострочено: " : g.service.status === "soon" ? "Скоро ТО: " : "Наступне ТО: "}
                {g.service.status === "overdue" ? `мало бути на ${nf(g.service.due_km)} км або до ${new Date(g.service.due_date).toLocaleDateString("uk-UA")}`
                  : `через ${nf(g.service.km_left)} км або до ${new Date(g.service.due_date).toLocaleDateString("uk-UA")}`}
                {` (інтервал ${nf(g.service.interval_km)} км / ${g.service.interval_months} міс.)`}
              </Notice>
            )}
            <Row>{Object.entries(TYPES).map(([k, l]) => <Chip key={k} label={l} on={e.type === k} onPress={() => set({ type: k })} />)}</Row>
            <Row style={{ alignItems: "flex-start" }}>
              <Field label="Сума, грн" keyboardType="decimal-pad" value={e.cost} onChangeText={(cost) => set({ cost })} />
              <Field label="Пробіг, км" keyboardType="numeric" placeholder={String(g.current_km)} value={e.km} onChangeText={(v) => set({ km: v })} />
            </Row>
            <Field label="Примітка" placeholder="45 л, А-95" value={e.note} onChangeText={(note) => set({ note })} />
            <Button title="Додати запис" onPress={() => addEntry(g)} />
            {[...g.entries].reverse().slice(0, 10).map((x) => (
              <Row key={x.id} style={{ justifyContent: "space-between" }}>
                <T v="small">{x.date} · {TYPES[x.type]}{x.note ? ` · ${x.note}` : ""}{x.id < 0 ? " · не надіслано" : ""}</T>
                <T v="small" style={{ fontWeight: "700", color: x.id < 0 ? t.muted : t.ink }}>{nf(x.cost_uah)} грн</T>
              </Row>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

function NotificationsBlock() {
  const toast = useToast();
  const { user, updateUser } = useStore();
  const { data, reload } = useApi<{ unread: number; items: { id: number; kind: string; text: string; slug: string | null; read: boolean }[] }>("/api/me/notifications");
  if (!user || !data) return null;
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <T v="h3">Сповіщення{data.unread ? ` · ${data.unread} нових` : ""}</T>
        {data.unread > 0 && <Button small kind="ghost" title="Прочитано" onPress={async () => { await api("/api/me/notifications/read", { method: "POST" }); reload(); }} />}
      </Row>
      {data.items.length === 0 && <T v="muted">Тут з’являться зміни цін і нові відгуки про авто з вашого обраного.</T>}
      {data.items.slice(0, 10).map((n) => (
        <Pressable key={n.id} onPress={() => n.slug && router.push({ pathname: "/car/[slug]", params: { slug: n.slug } })}>
          <T v="small" style={{ fontWeight: n.read ? "400" : "700" }}>{n.kind === "price" ? "Ціна · " : "Відгук · "}{n.text}</T>
        </Pressable>
      ))}
      <Chip label={user.email_notifications ? "Листи про обране: увімкнено" : "Листи про обране: вимкнено"} on={user.email_notifications}
        onPress={async () => { const u = await api<User>("/api/me", { method: "PATCH", json: { email_notifications: !user.email_notifications } }); updateUser(u); toast("Збережено"); }} />
    </Card>
  );
}

export default function Account() {
  const { user, signOut, favs, setCompare, ready } = useStore();
  const toast = useToast();
  const [favList, setFavList] = useState<Car[]>([]);
  useEffect(() => {
    Promise.all(favs.map((s) => api<Car>(`/api/cars/${encodeURIComponent(s)}`).catch(() => null)))
      .then((l) => setFavList(l.filter((c): c is Car => c !== null)));
  }, [favs]);
  const saved = useApi<{ id: number; name: string; slugs: string[] }[]>(user ? "/api/me/comparisons" : null, undefined, [user?.id]);
  if (!ready) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      {user ? (
        <Row style={{ justifyContent: "space-between" }}><T>Ви увійшли як <T style={{ fontWeight: "700" }}>{user.email}</T></T><Button small kind="ghost" title="Вийти" onPress={() => { signOut(); toast("Ви вийшли"); }} /></Row>
      ) : (
        <><T v="muted">Увійдіть, щоб зберігати порівняння, синхронізувати обране з сайтом і вести гараж.</T><Auth /></>
      )}
      <T v="h2">Обране</T>
      {favList.length ? favList.map((c) => <CarRow key={c.slug} car={c} />) : <T v="muted">Тут з’являться обрані модифікації. Натисніть «☆ В обране» на сторінці авто.</T>}
      {user && (
        <>
          <T v="h2">Збережені порівняння</T>
          {saved.data?.length ? saved.data.map((s) => (
            <Card key={s.id}>
              <T v="h3">{s.name}</T>
              <Row>
                <Button small title="Відкрити" onPress={() => { setCompare(s.slugs.slice(0, 5)); router.push("/compare"); }} />
                <Button small kind="ghost" title="Видалити" onPress={async () => { await api(`/api/me/comparisons/${s.id}`, { method: "DELETE" }); saved.reload(); }} />
              </Row>
            </Card>
          )) : <T v="muted">Збережених порівнянь поки немає.</T>}
          <NotificationsBlock />
          <Garage />
          <Profile />
        </>
      )}
    </Screen>
  );
}
