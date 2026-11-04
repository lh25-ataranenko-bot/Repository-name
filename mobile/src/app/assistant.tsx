import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance } from "react-native";
import { CarRow } from "@/components/CarRow";
import { Button, Chip, Field, Loading, Notice, Row, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Car } from "@/lib/types";

interface Turn { role: "user" | "assistant"; text: string; cars?: Car[]; notice?: string | null }

const EXAMPLES = [
  "Сімейний кросовер до 25 000 $ з автоматом",
  "Який електромобіль найдешевший в утриманні?",
  "Що часто ламається в BMW 320d F30?",
];

export default function Assistant() {
  const t = useTheme();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ answer: string; cars: Car[]; notice?: string }>("/api/assistant", {
        method: "POST", json: { messages: next.slice(-10).map(({ role, text }) => ({ role, text })) },
      });
      setTurns([...next, { role: "assistant", text: r.answer, cars: r.cars, notice: r.notice }]);
    } catch (e) {
      setError((e as Error).message);
      setTurns(turns);
      setText(q);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <T v="muted">Помічник відповідає лише на основі каталогу AutoWise. Якщо даних немає, він так і скаже.</T>
        {turns.length === 0 && <Row>{EXAMPLES.map((e) => <Chip key={e} label={e} onPress={() => send(e)} />)}</Row>}
        {turns.map((m, i) => (
          <View key={i} style={{ gap: 8, alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
            <View style={{ backgroundColor: m.role === "user" ? t.accentSoft : t.surface, borderColor: m.role === "user" ? t.accent : t.line,
              borderWidth: 1, borderRadius: 12, padding: 12, maxWidth: m.role === "user" ? "85%" : "100%" }}>
              <T>{m.text}</T>
            </View>
            {m.notice && <T v="muted">{m.notice}</T>}
            {m.cars?.slice(0, 3).map((c) => <CarRow key={c.slug} car={c} />)}
          </View>
        ))}
        {busy && <Loading />}
        {error && <Notice>{error}</Notice>}
        <T v="muted">Відповіді генерує модель штучного інтелекту й можуть містити неточності.</T>
      </ScrollView>
      <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.surface }}>
        <Field label="Ваше запитання" value={text} onChangeText={setText} maxLength={1000} returnKeyType="send" onSubmitEditing={() => send(text)} editable={!busy} />
        <Row>
          <Button kind="primary" title="Запитати" disabled={busy || !text.trim()} onPress={() => send(text)} />
          {turns.length > 0 && <Button kind="ghost" small title="Нова розмова" onPress={() => setTurns([])} />}
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}
