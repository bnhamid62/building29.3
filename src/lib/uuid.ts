/**
 * crypto.randomUUID() only exists in secure contexts (HTTPS, or localhost).
 * When the app is opened over plain HTTP via a LAN IP (e.g. during local
 * development from a phone), the browser disables it entirely. This
 * fallback keeps idempotency keys working everywhere.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}