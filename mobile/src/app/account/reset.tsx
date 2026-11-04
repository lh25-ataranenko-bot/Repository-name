import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Card, Field, Notice, Screen, T, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { User } from "@/lib/types";

/** Opened from the password-reset email: autowise://account/reset?token=… */
export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const t = useTheme();
  const toast = useToast();
  const { signIn } = useStore();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!token) return <Screen><Notice>У посиланні немає коду. Відкрийте посилання з листа повністю або запросіть новий лист у кабінеті.</Notice></Screen>;
  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError("Пароль має містити щонайменше 8 символів.");
    if (password !== repeat) return setError("Паролі не збігаються.");
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/reset", { method: "POST", json: { token, password } });
      await signIn(r.token, r.user);
      toast("Пароль змінено. Інші пристрої вийшли з облікового запису.");
      router.replace("/account");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Screen>
      <T v="h1">Новий пароль</T>
      <T v="muted">Після зміни пароля всі інші пристрої вийдуть з облікового запису.</T>
      <Card>
        <Field label="Новий пароль (щонайменше 8 символів)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Field label="Повторіть пароль" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" />
        {error && <T style={{ color: t.bad }}>{error}</T>}
        <Button kind="primary" title="Зберегти пароль" onPress={submit} />
      </Card>
    </Screen>
  );
}
