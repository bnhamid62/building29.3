/* Building 29 — dedicated Web Push worker (no app-shell caching here). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: event.data ? event.data.text() : "" };
  }
  const title = payload.title || payload.title_fr || payload.title_ar || "Immeuble 29";
  const body = payload.body || payload.body_fr || payload.body_ar || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      data: { url: payload.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus().then(() => existing.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
