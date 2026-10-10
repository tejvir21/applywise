import { ApiClientError, type ApiResponse } from "@/types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(
      "INVALID_RESPONSE",
      "The server returned an unreadable response",
      response.status,
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new ApiClientError(
      "INVALID_RESPONSE",
      "The server returned an unexpected payload",
      response.status,
    );
  }

  if (payload.success === true) {
    return payload.data;
  }

  throw new ApiClientError(
    payload.error.code,
    payload.error.message,
    response.status,
    payload.error.details ?? {},
  );
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: withAuthHeader({ Accept: "application/json" }),
  });
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: withAuthHeader({ Accept: "application/json", "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: withAuthHeader({ Accept: "application/json", "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: withAuthHeader({ Accept: "application/json", "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: withAuthHeader({ Accept: "application/json" }),
  });
  return parseResponse<T>(response);
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: withAuthHeader({ Accept: "application/json" }),
    body: form,
  });
  return parseResponse<T>(response);
}

export interface DownloadResult {
  blob: Blob;
  filename: string;
  contentType: string;
}

/** Binary download through the shared auth/refresh pipeline. Used for private
 *  resume files served by the authenticated backend route — never a direct
 *  storage URL. Error envelopes are JSON and surface as ApiClientError. */
export async function apiDownload(path: string): Promise<DownloadResult> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: withAuthHeader({ Accept: "*/*" }),
  });
  if (!response.ok) {
    await parseResponse<unknown>(response).catch((err) => {
      throw err;
    });
    throw new ApiClientError("DOWNLOAD_FAILED", "Download failed", response.status);
  }
  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") ?? blob.type ?? "application/octet-stream";
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = decodeURIComponent(match?.[1] ?? match?.[2] ?? "download");
  return { blob, filename, contentType };
}

// Access token holder, wired by the auth store. The token lives only in
// memory (never localStorage) and is never logged.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function withAuthHeader(headers: Record<string, string>): Record<string, string> {
  if (accessToken) {
    return { ...headers, Authorization: `Bearer ${accessToken}` };
  }
  return headers;
}

/**
 * Silent refresh wiring (single mechanism, set once by the auth store):
 * - refreshAccessToken performs a cookie-based refresh and resolves the new
 *   access token (or null when no session can be restored).
 * - onSessionExpired runs when refresh fails (store clears state; app navigates).
 */
let refreshAccessToken: (() => Promise<string | null>) | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setRefreshHandler(fn: () => Promise<string | null>) {
  refreshAccessToken = fn;
}

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** Auth endpoints must surface their own 401s (login failures, signed-out
 *  restore) instead of triggering a refresh loop. */
function isAuthPath(url: string): boolean {
  return (
    url.includes("/api/auth/login") ||
    url.includes("/api/auth/register") ||
    url.includes("/api/auth/refresh") ||
    url.includes("/api/auth/session")
  );
}

/**
 * Credentialed fetch with exactly one 401 retry: concurrent 401s share a
 * single refresh flight, and a failed refresh signs the session out once.
 * Never loops: the retried request is never refreshed again.
 */
async function fetchWithAuthRetry(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, credentials: "include" });
  if (response.status !== 401 || isAuthPath(url) || !refreshAccessToken) {
    return response;
  }
  try {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const token = await refreshInFlight;
    if (!token) {
      onSessionExpired?.();
      return response;
    }
    return await fetch(url, {
      ...init,
      credentials: "include",
      headers: { ...((init.headers ?? {}) as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  } catch {
    onSessionExpired?.();
    return response;
  }
}

export { API_BASE_URL };
