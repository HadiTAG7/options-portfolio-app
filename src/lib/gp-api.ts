"use client";

import { firebaseAuth } from "@/lib/firebase";
import { apiUrl } from "@/lib/api-base";

// Client for the GP-only server routes. Every call carries a fresh ID
// token (the server checks the gp claim) and goes through apiUrl, so it
// works from Firebase Hosting and the APK as well as Vercel. status 0
// means the server could not be reached at all.
export type GpResult<T> =
  | ({ ok: true; serverTime: string } & T)
  | ({ ok: false; error: string; code?: string; status: number; serverTime?: string } & Record<string, unknown>);

export async function callGpApi<T>(path: string, body: Record<string, unknown>): Promise<GpResult<T>> {
  const user = firebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  if (!token) return { ok: false, error: "سجّل الدخول كمدير أولاً", status: 401 };
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: `تعذّر الاتصال بالخادم (${apiUrl(path)})`, status: 0 };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `رد غير صالح من الخادم (HTTP ${res.status})`, status: res.status };
  }
  if (!res.ok || data.ok !== true) {
    return { ...(data as object), ok: false, error: String(data.error ?? `HTTP ${res.status}`), status: res.status } as GpResult<T>;
  }
  return data as GpResult<T>;
}
