/**
 * Single place where the frontend learns how to reach the PHP REST API.
 *
 * Production/local development architecture: React PWA -> PHP 8 REST API -> MySQL (AppServ).
 * The default base URL is the AppServ development URL; override it with
 *   VITE_API_BASE_URL=https://api.example.com
 *
 * When no explicit VITE_API_BASE_URL is set, the API address is derived
 * automatically from whatever hostname the browser used to load the app
 * (localhost, a LAN IP, ngrok...). This means the app keeps working even
 * when the machine's local IP changes (e.g. DHCP reassigns it).
 *
 * The in-browser demo dataset is NOT a fallback any more: it only runs when it is
 * explicitly requested with VITE_DEMO_MODE=true. When the PHP API cannot be reached
 * the app shows a connection error instead of fake data.
 */
const configured = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim();

function autoBaseUrl(): string {
  if (typeof window === "undefined") return "http://localhost/building29/api";
  return `http://${window.location.hostname}/building29/api`;
}

export const API_BASE_URL: string =
  configured && configured !== ""
    ? configured.replace(/\/$/, "")
    : autoBaseUrl();

/**
 * Demo mode is a development-only escape hatch. Requiring DEV as well means the
 * demo dataset (and its sample credentials) is never part of a production build.
 */
export const DEMO_MODE =
  import.meta.env.DEV &&
  (import.meta.env["VITE_DEMO_MODE"] as string | undefined)?.trim() === "true";