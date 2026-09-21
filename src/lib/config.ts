/**
 * Single place where the frontend learns how to reach the PHP REST API.
 *
 * Production/local development architecture: React PWA -> PHP 8 REST API -> MySQL (AppServ).
 * The default base URL is the AppServ development URL; override it with
 *   VITE_API_BASE_URL=https://api.example.com
 *
 * The in-browser demo dataset is NOT a fallback any more: it only runs when it is
 * explicitly requested with VITE_DEMO_MODE=true. When the PHP API cannot be reached
 * the app shows a connection error instead of fake data.
 */
const configured = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim();

export const API_BASE_URL: string =
  configured && configured !== ""
    ? configured.replace(/\/$/, "")
    : "http://localhost/building29/api";

/**
 * Demo mode is a development-only escape hatch. Requiring DEV as well means the
 * demo dataset (and its sample credentials) is never part of a production build.
 */
export const DEMO_MODE =
  import.meta.env.DEV &&
  (import.meta.env["VITE_DEMO_MODE"] as string | undefined)?.trim() === "true";
