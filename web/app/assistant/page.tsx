"use client";

import { useEffect, useRef, useState } from "react";
import { CarCard } from "@/components/CarCard";
import { api } from "@/lib/api";
import type { Car } from "@/lib/types";

interface Turn { role: "user" | "assistant"; text: string; cars?: Car[]; source?: "ai" | "rules"; notice?: string | null }

const EXAMPLES = [
  "Сімейний кросовер до 25 000 $ з автоматом. Що надійніше?",
  "Порівняй Toyota Camry і Skoda Superb за витратами на 5 років",
  "Який електромобіль найдешевший в утриманні?",
  "Що часто ламається в BMW 320d F30?",
];
const KEY = "autowise-assistant-v1";

export default function Assistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setTurns(JSON.parse(sessionStorage.getItem(KEY) || "[]")); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(turns)); } catch { /* storage blocked */ }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      // Only the last 10 turns go to the server.
      const r = await api<{ answer: string; cars: Car[]; source: "ai" | "rules"; notice?: string }>("/api/assistant", {
        method: "POST", json: { messages: next.slice(-10).map(({ role, text }) => ({ role, text })) },
      });
      setTurns([...next, { role: "assistant", text: r.answer, cars: r.cars, source: r.source, notice: r.notice }]);
    } catch (e) {
      setError((e as Error).message);
      setTurns(turns);
      setText(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head"><p className="eyebrow">AI-помічник</p><h1>Запитайте про вибір авто</h1>
        <p>Помічник відповідає лише на основі каталогу AutoWise: характеристик, цін, витрат і типових несправностей. Якщо даних немає, він так і скаже.</p></div>
      <div className="stack" style={{ maxWidth: 860 }}>
        {turns.length === 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Приклади запитань</span>
            <div className="chips">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`chat-turn ${t.role}`}>
            <div className="chat-bubble">
              {t.text.split("\n").map((line, j) => <p key={j}>{line || " "}</p>)}
            </div>
            {t.notice && <p className="small muted">{t.notice}</p>}
            {t.cars && t.cars.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <span className="label">{t.source === "ai" ? "Автомобілі, які розглянув помічник" : "Варіанти з каталогу"}</span>
                <div className="cards">{t.cars.slice(0, 4).map((c) => <CarCard key={c.slug} car={c} />)}</div>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="loading">Помічник шукає в каталозі…</p>}
        {error && <div className="notice">{error}</div>}
        <form className="smart-row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input aria-label="Ваше запитання" value={text} maxLength={1000} placeholder="Наприклад: що економніше в місті — гібрид чи дизель?"
            onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button className="btn-primary" type="submit" disabled={busy || !text.trim()}>Запитати</button>
        </form>
        {turns.length > 0 && <button className="btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setTurns([])}>Почати нову розмову</button>}
        <p className="small muted">Відповіді генерує модель штучного інтелекту й можуть містити неточності. Перевіряйте важливі цифри на сторінці авто.</p>
      </div>
      <div ref={end} />
    </>
  );
}
