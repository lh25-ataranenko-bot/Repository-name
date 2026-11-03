import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CarPicker } from "@/components/CarPicker";
import { CarRow } from "@/components/CarRow";
import { Button, Card, Chip, Field, Loading, Notice, Row, Screen, T, useToast } from "@/components/ui";
import { api } from "@/lib/api";
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
  const toast = useToast();
  const { data, error, reload } = useApi<GarageCar[]>("/api/me/garage");
  const [slug, setSlug] = useState("skoda-octavia-a7-16tdi");
  const [name, setName] = useState("");
  const [km, setKm] = useState("150000");
  const [entry, setEntry] = useState<Record<number, { type: string; cost: string; km: string; note: string }>>({});

  const add = async () => {
    await api("/api/me/garage", { method: "POST", json: { slug, name: name || "Моє авто", start_km: parseInt(km, 10) || 0 } });
    setName("");
    toast("Авто додано в гараж");
    reload();
  };
  const addEntry = async (g: GarageCar) => {
    const e = entry[g.id] ?? { type: "fuel", cost: "", km: "", note: "" };
    if (!e.cost) return toast("Вкажіть суму");
    await api(`/api/me/garage/${g.id}/entries`, { method: "POST", json: {
      date: new Date().toISOString().slice(0, 10), type: e.type, cost_uah: parseFloat(e.cost) || 0, km: parseInt(e.km, 10) || g.current_km, note: e.note,
    } });
    setEntry({ ...entry, [g.id]: { type: e.type, cost: "", km: "", note: "" } });
    toast("Запис додано");
    reload();
  };

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">Мій гараж</T>
      <Card>
        <CarPicker value={slug} onChange={(c) => setSlug(c.slug)} />
        <Row style={{ alignItems: "flex-start" }}>
          <Field label="Назва" placeholder="Робоча Октавія" value={name} onChangeText={setName} />
          <Field label="Пробіг, км" keyboardType="numeric" value={km} onChangeText={setKm} />
        </Row>
        <Button kind="primary" title="Додати в гараж" onPress={add} />
      </Card>
      {!data ? <Loading error={error} /> : data.length === 0 ? <T v="muted">Гараж порожній. Додайте авто, щоб вести облік заправок, ТО і ремонтів.</T> : data.map((g) => {
        const e = entry[g.id] ?? { type: "fuel", cost: "", km: "", note: "" };
        const set = (patch: Partial<typeof e>) => setEntry({ ...entry, [g.id]: { ...e, ...patch } });
        return (
          <Card key={g.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}><T v="h3">{g.name}</T><T v="muted">{g.modification?.name ?? "—"}</T></View>
              <Button small kind="ghost" title="Видалити" onPress={async () => { await api(`/api/me/garage/${g.id}`, { method: "DELETE" }); reload(); }} />
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <View><T v="label">Витрачено</T><T v="h3">{nf(g.total_uah)} грн</T></View>
              <View><T v="label">Пройдено</T><T v="h3">{nf(g.driven_km)} км</T></View>
              <View><T v="label">1 км</T><T v="h3">{g.per_km_uah != null ? `${nf(g.per_km_uah, 2)} грн` : "—"}</T></View>
            </Row>
            <Row>{Object.entries(TYPES).map(([k, l]) => <Chip key={k} label={l} on={e.type === k} onPress={() => set({ type: k })} />)}</Row>
            <Row style={{ alignItems: "flex-start" }}>
              <Field label="Сума, грн" keyboardType="decimal-pad" value={e.cost} onChangeText={(cost) => set({ cost })} />
              <Field label="Пробіг, км" keyboardType="numeric" placeholder={String(g.current_km)} value={e.km} onChangeText={(v) => set({ km: v })} />
            </Row>
            <Field label="Примітка" placeholder="45 л, А-95" value={e.note} onChangeText={(note) => set({ note })} />
            <Button title="Додати запис" onPress={() => addEntry(g)} />
            {[...g.entries].reverse().slice(0, 10).map((x) => (
              <Row key={x.id} style={{ justifyContent: "space-between" }}>
                <T v="small">{x.date} · {TYPES[x.type]}{x.note ? ` · ${x.note}` : ""}</T>
                <T v="small" style={{ fontWeight: "700" }}>{nf(x.cost_uah)} грн</T>
              </Row>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

export default function Account() {
  const { user, signOut, favs, setCompare, ready } = useStore();
  const toast = useToast();
  const all = useApi<{ items: Car[] }>("/api/cars?sort=price");
  const saved = useApi<{ id: number; name: string; slugs: string[] }[]>(user ? "/api/me/comparisons" : null, undefined, [user?.id]);
  if (!ready) return <Screen><Loading /></Screen>;
  const favList = (all.data?.items ?? []).filter((c) => favs.includes(c.slug));

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
          <Garage />
          <Profile />
        </>
      )}
    </Screen>
  );
}
