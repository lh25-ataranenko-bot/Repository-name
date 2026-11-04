/**
 * Garage that works without a connection.
 *
 * The last list received from the server is kept on the phone and shown when offline.
 * Entries (refuelling, service, repair) added offline wait in an outbox and are sent
 * when the connection returns: on screen focus, when the app comes back to the
 * foreground, or with the "send now" button. An entry leaves the outbox only after the
 * server confirms it. Every entry carries a client_id, and the server ignores a repeat,
 * so a resend after a lost response does not create a duplicate.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api, ApiError } from "./api";
import type { GarageCar } from "./types";

export interface EntryPayload { date: string; type: string; cost_uah: number; km: number; note: string; client_id?: string }
interface Pending { localId: string; garageId: number; payload: EntryPayload; queuedAt: string }

const cacheKey = (uid: number) => `autowise-garage-cache-${uid}`;
const outboxKey = (uid: number) => `autowise-garage-outbox-${uid}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const s = await AsyncStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => null);

const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

/** Server list plus queued entries, with totals recomputed so the screen stays truthful offline. */
function merge(cars: GarageCar[], outbox: Pending[]): (GarageCar & { pending: number })[] {
  return cars.map((g) => {
    const mine = outbox.filter((p) => p.garageId === g.id);
    if (!mine.length) return { ...g, pending: 0 };
    const entries = [...g.entries, ...mine.map((p, i) => ({ id: -1 - i, ...p.payload, note: p.payload.note, pending: true }))];
    const total = entries.reduce((s, e) => s + e.cost_uah, 0);
    const current = Math.max(g.start_km, ...entries.map((e) => e.km));
    const driven = current - g.start_km;
    const byType: Record<string, number> = {};
    for (const e of entries) byType[e.type] = (byType[e.type] ?? 0) + e.cost_uah;
    return { ...g, entries, total_uah: total, current_km: current, driven_km: driven,
      per_km_uah: driven > 0 ? total / driven : null, by_type: byType, pending: mine.length };
  });
}

export function useGarage(userId: number | undefined) {
  const [cars, setCars] = useState<GarageCar[] | null>(null);
  const [outbox, setOutbox] = useState<Pending[]>([]);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  const fetchList = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await api<GarageCar[]>("/api/me/garage");
      setCars(list);
      setOffline(false);
      setError(null);
      await writeJson(cacheKey(userId), list);
    } catch (e) {
      if (isOffline(e)) setOffline(true);
      else setError((e as Error).message);
    }
  }, [userId]);

  /** Sends queued entries in order; stops at the first network failure. */
  const sync = useCallback(async () => {
    if (!userId || busy.current) return;
    busy.current = true;
    setSyncing(true);
    let queue = await readJson<Pending[]>(outboxKey(userId), []);
    let sent = 0;
    const dropped: string[] = [];
    try {
      while (queue.length) {
        const p = queue[0];
        try {
          await api(`/api/me/garage/${p.garageId}/entries`, { method: "POST", json: p.payload });
          sent++;
        } catch (e) {
          if (isOffline(e)) break;
          // The server refused it (car deleted, invalid value): it will never succeed, so drop it and say so.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
            dropped.push(`${p.payload.date}, ${p.payload.cost_uah} грн: ${(e as Error).message}`);
          } else {
            break;
          }
        }
        queue = queue.slice(1);
        await writeJson(outboxKey(userId), queue);
      }
    } finally {
      setOutbox(queue);
      busy.current = false;
      setSyncing(false);
    }
    if (dropped.length) setNotice(`Не вдалося зберегти записи: ${dropped.join("; ")}`);
    else if (sent) setNotice(`Надіслано записів, збережених без мережі: ${sent}`);
    await fetchList();
  }, [userId, fetchList]);

  // Show the saved copy at once, then refresh and flush the outbox.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setCars(await readJson<GarageCar[] | null>(cacheKey(userId), null));
      setOutbox(await readJson<Pending[]>(outboxKey(userId), []));
      await sync();
    })();
  }, [userId, sync]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") sync(); });
    return () => sub.remove();
  }, [sync]);

  const addEntry = useCallback(async (garageId: number, input: EntryPayload): Promise<"sent" | "queued"> => {
    if (!userId) throw new Error("Увійдіть в обліковий запис");
    const localId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = { ...input, client_id: localId };
    try {
      await api(`/api/me/garage/${garageId}/entries`, { method: "POST", json: payload });
      await fetchList();
      return "sent";
    } catch (e) {
      if (!isOffline(e)) throw e;
      const item: Pending = { localId, garageId, payload, queuedAt: new Date().toISOString() };
      const queue = [...(await readJson<Pending[]>(outboxKey(userId), [])), item];
      await writeJson(outboxKey(userId), queue);
      setOutbox(queue);
      setOffline(true);
      return "queued";
    }
  }, [userId, fetchList]);

  return {
    cars: cars ? merge(cars, outbox) : null,
    pending: outbox.length, offline, syncing, error, notice, clearNotice: () => setNotice(null),
    reload: fetchList, sync, addEntry,
  };
}
