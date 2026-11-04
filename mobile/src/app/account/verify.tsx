import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Button, Loading, Notice, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

/** Opened from the confirmation email: autowise://account/verify?token=… */
export default function Verify() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, updateUser } = useStore();
  const [state, setState] = useState<"wait" | "ok" | "error">("wait");
  const [msg, setMsg] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !token) return;
    done.current = true;
    api<User>("/api/auth/verify", { method: "POST", json: { token } })
      .then((u) => { setState("ok"); if (user && user.id === u.id) updateUser(u); })
      .catch((e: Error) => { setState("error"); setMsg(e.message); });
  }, [token, user, updateUser]);

  if (!token) return <Screen><Notice>У посиланні немає коду. Відкрийте посилання з листа повністю.</Notice></Screen>;
  if (state === "wait") return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <T v="h1">{state === "ok" ? "Пошту підтверджено" : "Не вдалося підтвердити пошту"}</T>
      <T v="muted">{state === "ok" ? "Дякуємо! Тепер можна відновлювати пароль через цю пошту." : msg}</T>
      <Button kind="primary" title="До кабінету" onPress={() => router.replace("/account")} />
    </Screen>
  );
}
