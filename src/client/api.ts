export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status = 500, payload: unknown = null) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.name = "ApiError";
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: "include",
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export async function uploadImage(
  file: File,
): Promise<{ url: string; filename: string; size: number; mimeType: string }> {
  const form = new FormData();
  form.append("file", file);
  return api("/api/uploads", { method: "POST", body: form });
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "Never";
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // LAN HTTP pages are not always a secure context; use the fallback below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function formatCp(cp: number): string {
  const safe = Math.max(0, Math.round(cp));
  const gp = Math.floor(safe / 100);
  const sp = Math.floor((safe % 100) / 10);
  const copper = safe % 10;
  const parts: string[] = [];
  if (gp) parts.push(`${gp.toLocaleString()} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (copper || !parts.length) parts.push(`${copper} cp`);
  return parts.join(" ");
}
