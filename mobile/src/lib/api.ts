import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * API address:
 * 1. EXPO_PUBLIC_API_URL, if set (production builds point this at the real server);
 * 2. in development, the computer running `expo start` (works for Expo Go on a phone in the same Wi-Fi);
 * 3. otherwise localhost (10.0.2.2 on the Android emulator).
 */
function resolveBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:8000`;
  return Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
}
export const API_BASE = resolveBase();

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  } catch {
    throw new ApiError(0, `Немає зв’язку із сервером ${API_BASE}. Перевірте інтернет або адресу API.`);
  }
  if (!res.ok) {
    let msg = `Помилка ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = "Перевірте введені дані: " + body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
