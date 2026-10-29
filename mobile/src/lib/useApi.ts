import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** Fetch with loading/error state; `key` changes trigger a refetch. */
export function useApi<T>(path: string | null, init?: RequestInit & { json?: unknown }, key: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const body = init?.json !== undefined ? JSON.stringify(init.json) : "";
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>(path, init)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, body, ...key]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}
