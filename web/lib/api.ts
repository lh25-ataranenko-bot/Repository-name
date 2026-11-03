// On the server we call the API directly; in the browser we go through the /api rewrite.
const base = () => (typeof window === "undefined" ? process.env.API_URL_INTERNAL ?? "http://localhost:8000" : "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

// Called when the server rejects the saved session (expired, or password changed elsewhere).
let onUnauthorized: ((message: string) => void) | null = null;
export const setUnauthorizedHandler = (fn: (message: string) => void) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base() + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Помилка ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = "Перевірте введені дані: " + body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* not JSON */
    }
    if (res.status === 401 && token && onUnauthorized) onUnauthorized(msg);
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
