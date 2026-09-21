import { useEffect, useState } from "react";

/** Live connection state. Server render always reports "online" to avoid hydration drift. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

/** Thrown by guarded mutations so the UI can show one consistent message. */
export class OfflineError extends Error {
  constructor() {
    super("offline_mutation_blocked");
    this.name = "OfflineError";
  }
}

/** Every write path funnels through this: no financial or state-changing call leaves the app offline. */
export function assertOnline(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new OfflineError();
}
