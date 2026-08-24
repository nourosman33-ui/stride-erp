// Resolved per-request from wherever the page was actually loaded, rather than a
// value baked in at build time. The frontend and backend always run on the same
// host, one port apart (3002/3000 in dev, 4001/4000 in the permanent instance) —
// so deriving the API host from window.location.hostname means the same build
// works whether it's opened via localhost, a LAN IP, or a VPN address, with no
// rebuild needed when the network path changes. NEXT_PUBLIC_API_URL remains the
// fallback for SSR (no `window`) and for the rare case the API truly lives on a
// different host than the frontend.
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT ?? "3000";

function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${BACKEND_PORT}/api/v1`;
}
const TOKEN_COOKIE = "stride_token";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// Fires when the API rejects a request as unauthenticated (expired/invalid JWT).
// AuthProvider subscribes to this once, at mount, to force a clean logout —
// there is no refresh-token endpoint on the backend yet, so an expired 15-minute
// access token always means "log in again" (see auth-context.tsx).
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function onUnauthorized(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAuthCookie(token: string) {
  if (typeof document === "undefined") return;
  // 15 min access-token lifetime (backend JWT_ACCESS_TTL) — mirror it here so a
  // stale cookie never outlives the token it represents.
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=900; samesite=lax`;
}

export function clearAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function getAuthToken(): string | null {
  return readCookie(TOKEN_COOKIE);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = new URL(`${resolveApiBaseUrl()}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, skipAuth = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      unauthorizedHandler?.();
    }
    const message =
      (payload && (payload.message || payload.error)) || response.statusText || "Request failed";
    throw new ApiError(response.status, Array.isArray(message) ? message.join(", ") : message, payload);
  }

  return payload as T;
}
