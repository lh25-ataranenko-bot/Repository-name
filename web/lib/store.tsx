"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "./api";
import type { User } from "./types";

interface Store {
  compare: string[];
  toggleCompare: (slug: string) => void;
  setCompare: (slugs: string[]) => void;
  favs: string[];
  toggleFav: (slug: string) => void;
  user: User | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  toast: (msg: string) => void;
  ready: boolean;
}

const Ctx = createContext<Store | null>(null);
const KEY = "autowise-web-v1";
const DEFAULT_COMPARE = ["toyota-camry-xv70", "vw-passat-b8-20tdi", "bmw-f30-320d-xdrive"];

function read(): { compare?: string[]; favs?: string[]; token?: string; user?: User } {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function write(patch: object) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    /* storage blocked */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [compare, setCompareState] = useState<string[]>(DEFAULT_COMPARE);
  const [favs, setFavs] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600);
  }, []);

  useEffect(() => {
    const s = read();
    if (s.compare) setCompareState(s.compare);
    if (s.favs) setFavs(s.favs);
    if (s.token && s.user) {
      setToken(s.token);
      setUser(s.user);
      api<string[]>("/api/me/favorites").then(setFavs).catch(() => {
        setToken(null);
        setUser(null);
        write({ token: undefined, user: undefined });
      });
    }
    setReady(true);
  }, []);

  const setCompare = (slugs: string[]) => {
    setCompareState(slugs);
    write({ compare: slugs });
  };

  const toggleCompare = (slug: string) => {
    if (compare.includes(slug)) {
      setCompare(compare.filter((s) => s !== slug));
      toast("Прибрано з порівняння");
    } else if (compare.length >= 5) {
      toast("Порівнювати можна до 5 автомобілів. Приберіть один зі списку.");
    } else {
      setCompare([...compare, slug]);
      toast(`Додано до порівняння (${compare.length + 1}/5)`);
    }
  };

  const toggleFav = (slug: string) => {
    const on = favs.includes(slug);
    const next = on ? favs.filter((s) => s !== slug) : [...favs, slug];
    setFavs(next);
    write({ favs: next });
    toast(on ? "Прибрано з обраного" : "Додано в обране");
    if (user) api(`/api/me/favorites/${slug}`, { method: on ? "DELETE" : "PUT" }).catch(() => toast("Не вдалося зберегти обране на сервері"));
  };

  const signIn = (token: string, u: User) => {
    setToken(token);
    setUser(u);
    write({ token, user: u });
    // merge favourites collected before sign-in
    Promise.all(favs.map((s) => api(`/api/me/favorites/${s}`, { method: "PUT" }).catch(() => null)))
      .then(() => api<string[]>("/api/me/favorites"))
      .then((f) => {
        setFavs(f);
        write({ favs: f });
      })
      .catch(() => null);
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    write({ token: undefined, user: undefined });
    toast("Ви вийшли з облікового запису");
  };

  return (
    <Ctx.Provider value={{ compare, toggleCompare, setCompare, favs, toggleFav, user, signIn, signOut, toast, ready }}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
