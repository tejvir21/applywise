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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: withAuthHeader({ Accept: "application/json" }),
  });
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: withAuthHeader({ Accept: "application/json", "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: withAuthHeader({ Accept: "application/json", "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

// Access token holder, wired by the auth store. The token lives only in
// memory (never localStorage) and is never logged.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function withAuthHeader(headers: Record<string, string>): Record<string, string> {
  if (accessToken) {
    return { ...headers, Authorization: `Bearer ${accessToken}` };
  }
  return headers;
}

export { API_BASE_URL };
