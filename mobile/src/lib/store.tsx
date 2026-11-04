import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, ApiError, setToken, setUnauthorizedHandler } from "./api";
import type { User } from "./types";

interface Store {
  ready: boolean;
  compare: string[];
  toggleCompare: (slug: string) => string;
  setCompare: (slugs: string[]) => void;
  favs: string[];
  toggleFav: (slug: string) => void;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: User) => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "autowise-mobile-v1";
const TOKEN_KEY = "autowise-token";
const DEFAULT_COMPARE = ["toyota-camry-xv70", "vw-passat-b8-20tdi", "bmw-f30-320d-xdrive"];

// The token goes to the OS keychain; on web (dev preview only) SecureStore is unavailable.
const secure = {
  get: () => (Platform.OS === "web" ? AsyncStorage.getItem(TOKEN_KEY) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (v: string) => (Platform.OS === "web" ? AsyncStorage.setItem(TOKEN_KEY, v) : SecureStore.setItemAsync(TOKEN_KEY, v)),
  del: () => (Platform.OS === "web" ? AsyncStorage.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [compare, setCompareState] = useState<string[]>(DEFAULT_COMPARE);
  const [favs, setFavs] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const persist = (patch: object) =>
    AsyncStorage.getItem(KEY)
      .then((s) => AsyncStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(s || "{}"), ...patch })))
      .catch(() => null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      persist({ user: undefined });
      secure.del().catch(() => null);
    });
    (async () => {
      try {
        const s = JSON.parse((await AsyncStorage.getItem(KEY)) || "{}");
        if (s.compare) setCompareState(s.compare);
        if (s.favs) setFavs(s.favs);
        const t = await secure.get();
        if (t) {
          setToken(t);
          // The saved profile lets the app work offline; the server copy replaces it when reachable.
          if (s.user) setUser(s.user);
          try {
            const u = await api<User>("/api/me");
            setUser(u);
            persist({ user: u });
            setFavs(await api<string[]>("/api/me/favorites"));
          } catch (e) {
            // Sign out only when the server rejected the session, not when it was unreachable.
            if (e instanceof ApiError && e.status === 401) {
              setToken(null);
              setUser(null);
              persist({ user: undefined });
              await secure.del();
            }
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setCompare = (slugs: string[]) => {
    setCompareState(slugs);
    persist({ compare: slugs });
  };
  const toggleCompare = (slug: string) => {
    if (compare.includes(slug)) {
      setCompare(compare.filter((s) => s !== slug));
      return "Прибрано з порівняння";
    }
    if (compare.length >= 5) return "Порівнювати можна до 5 автомобілів. Приберіть один зі списку.";
    setCompare([...compare, slug]);
    return `Додано до порівняння (${compare.length + 1}/5)`;
  };
  const toggleFav = (slug: string) => {
    const on = favs.includes(slug);
    const next = on ? favs.filter((s) => s !== slug) : [...favs, slug];
    setFavs(next);
    persist({ favs: next });
    if (user) api(`/api/me/favorites/${slug}`, { method: on ? "DELETE" : "PUT" }).catch(() => null);
  };
  const signIn = async (t: string, u: User) => {
    setToken(t);
    await secure.set(t);
    setUser(u);
    persist({ user: u });
    await Promise.all(favs.map((s) => api(`/api/me/favorites/${s}`, { method: "PUT" }).catch(() => null)));
    const f = await api<string[]>("/api/me/favorites").catch(() => favs);
    setFavs(f);
    persist({ favs: f });
  };
  const signOut = async () => {
    setToken(null);
    setUser(null);
    persist({ user: undefined });
    await secure.del();
  };

  return (
    <Ctx.Provider value={{ ready, compare, toggleCompare, setCompare, favs, toggleFav, user, signIn, signOut, updateUser: (u: User) => { setUser(u); persist({ user: u }); } }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
