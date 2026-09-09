import { notificationsApi } from "@/api/endpoints";

/**
 * Push uses its own worker (`/push-sw.js`), independent from the offline
 * app-shell worker, so alerts work in every environment — including the
 * preview, where the caching worker is deliberately never registered.
 */
const PUSH_SW_URL = "/push-sw.js";
const PUSH_SW_SCOPE = "/push-notifications/";

function isPushWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL).pathname === PUSH_SW_URL;
  } catch {
    return false;
  }
}

async function findPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  return registrations.find(isPushWorker) ?? null;
}

async function waitUntilActive(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return registration;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("push_no_worker")), 10_000);
    const handleStateChange = () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        reject(new Error("push_no_worker"));
      }
    };
    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  });
  return registration;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await findPushRegistration();
    if (existing) return await waitUntilActive(existing);
    const registration = await navigator.serviceWorker.register(PUSH_SW_URL, {
      scope: PUSH_SW_SCOPE,
    });
    return await waitUntilActive(registration);
  } catch {
    return null;
  }
}

/** Web Push subscription workflow (standard Push API — no Firebase, no third party). */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await findPushRegistration();
  if (!registration) return false;
  return (await registration.pushManager.getSubscription()) !== null;
}

/**
 * Asks for permission, subscribes through the push worker and hands the
 * endpoint + keys to the PHP API. Throws a plain Error with a stable code the
 * UI translates.
 */
export async function enablePush(): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error("push_unsupported");

  const vapid = await notificationsApi.vapidKey();
  if (!vapid.public_key) throw new Error("push_failed");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("push_denied");

  const registration = await getPushRegistration();
  if (!registration) throw new Error("push_no_worker");

  const existing = await registration.pushManager.getSubscription();

  let subscription = existing;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.public_key) as BufferSource,
    });
  }

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("push_failed");

  await notificationsApi.subscribe({
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent.slice(0, 190),
  });
  return subscription;
}

export async function disablePush(): Promise<void> {
  const registration = await findPushRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await notificationsApi.unsubscribe(endpoint);
  await subscription.unsubscribe();
}
