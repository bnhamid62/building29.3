import { API_BASE_URL, DEMO_MODE } from "@/lib/config";

/** Thrown when the PHP API cannot be reached at all (server down, wrong URL, CORS). */
export const API_UNREACHABLE = "api_unreachable";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * The access token lives in memory ONLY — never localStorage/sessionStorage,
 * both of which any XSS (including one from a bad dependency) can read.
 * Session continuity comes from the httpOnly, secure, SameSite refresh cookie:
 * on app load we call /auth/refresh once to mint a fresh access token.
 */
let accessToken: string | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string | null): void {
  accessToken = token;
}

/**
 * Called once at startup, before the first authenticated request. Uses the
 * httpOnly refresh cookie; silently does nothing when there is no session.
 */
export async function bootstrapSession(): Promise<boolean> {
  try {
    const refreshed = await raw<{ access_token: string }>("POST", "/auth/refresh");
    setToken(refreshed.access_token);
    return true;
  } catch (error) {
    setToken(null);
    if (error instanceof ApiError && error.code === API_UNREACHABLE) throw error;
    return false;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** Loaded lazily so the demo dataset is code-split out of production bundles. */
async function demo(
  method: Method,
  path: string,
  body: Record<string, unknown> | undefined,
): Promise<unknown> {
  const { DemoError, demoRequest } = await import("./demo-server");
  try {
    return demoRequest(method, path, body, getToken());
  } catch (error) {
    if (error instanceof DemoError) throw new ApiError(error.status, error.code, error.message);
    throw error;
  }
}

async function raw<T>(method: Method, path: string, body?: Record<string, unknown>): Promise<T> {
  if (DEMO_MODE) {
    return (await demo(method, path, body)) as T;
  }

  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // Some shared hosts strip the Authorization header before it
        // reaches PHP; X-Auth-Token is a fallback the backend also checks.
        ...(token ? { Authorization: `Bearer ${token}`, "X-Auth-Token": token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, API_UNREACHABLE, `Cannot reach the API at ${API_BASE_URL}`);
  }

  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as {
        data?: unknown;
        error?: { code: string; message: string; fields?: Record<string, string> };
      })
    : {};

  if (!response.ok) {
    const err = payload.error;
    throw new ApiError(
      response.status,
      err?.code ?? "server_error",
      err?.message ?? "Request failed",
      err?.fields ?? {},
    );
  }
  return payload.data as T;
}

/** Calls the API and transparently refreshes an expired access token once. */
export async function request<T>(
  method: Method,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  try {
    return await raw<T>(method, path, body);
  } catch (error) {
    const isAuthPath = path.startsWith("/auth/");
    if (error instanceof ApiError && error.status === 401 && !isAuthPath) {
      try {
        const refreshed = await raw<{ access_token: string }>("POST", "/auth/refresh");
        setToken(refreshed.access_token);
        return await raw<T>(method, path, body);
      } catch {
        setToken(null);
        throw error;
      }
    }
    throw error;
  }
}

/** Multipart upload (files). Uses the same auth + envelope contract. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  if (DEMO_MODE) {
    const body: Record<string, unknown> = {};
    form.forEach((value, key) => {
      body[key] =
        value instanceof File ? { name: value.name, size: value.size, type: value.type } : value;
    });
    return (await demo("POST", path, body)) as T;
  }
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}`, "X-Auth-Token": token } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, API_UNREACHABLE, `Cannot reach the API at ${API_BASE_URL}`);
  }
  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as {
        data?: unknown;
        error?: { code: string; message: string; fields?: Record<string, string> };
      })
    : {};
  if (!response.ok) {
    const err = payload.error;
    throw new ApiError(
      response.status,
      err?.code ?? "server_error",
      err?.message ?? "Upload failed",
      err?.fields ?? {},
    );
  }
  return payload.data as T;
}

/**
 * Authenticated download. The API streams the bytes; the browser never sees a
 * filesystem path, and the bearer token is sent as a header (not in the URL).
 */
export async function download(path: string, filename: string): Promise<void> {
  if (DEMO_MODE) throw new ApiError(400, "demo_mode", "File downloads need the PHP API");
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}`, "X-Auth-Token": token } : {},
    });
  } catch {
    throw new ApiError(0, API_UNREACHABLE, `Cannot reach the API at ${API_BASE_URL}`);
  }
  if (!response.ok) {
    let code = "server_error";
    let message = "Download failed";
    try {
      const parsed = (await response.json()) as { error?: { code: string; message: string } };
      code = parsed.error?.code ?? code;
      message = parsed.error?.message ?? message;
    } catch {
      /* binary or empty body */
    }
    throw new ApiError(response.status, code, message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Record<string, unknown>) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: Record<string, unknown>) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload,
  download,
};
