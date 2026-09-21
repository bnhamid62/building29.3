import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import type { QueryClient, Query } from "@tanstack/react-query";
import { createStore, get, set, del } from "idb-keyval";

/**
 * Read-only offline cache.
 *
 * Only safe, per-user read queries are written to IndexedDB, and the store is
 * namespaced by the signed-in user so a resident can never read another
 * apartment's cached rows from a shared device.
 */
const CACHEABLE_ROOTS = new Set([
  "dashboard",
  "payments",
  "payments-mine",
  "projects",
  "notifications",
  "settings",
  "apartments",
  "documents",
  "meetings",
  "votes",
  "cameras",
]);

const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // one week of read-only history

let unsubscribe: (() => void) | null = null;

export interface CacheScope {
  userId: number;
  role: string;
  apartmentId: number | null;
}

function shouldPersist(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && CACHEABLE_ROOTS.has(root);
}

export function startQueryPersistence(queryClient: QueryClient, scope: CacheScope): void {
  stopQueryPersistence();
  const store = createStore("b29-offline", `u${scope.userId}-${scope.role}-a${scope.apartmentId ?? "none"}`);
  const persister = createAsyncStoragePersister({
    key: "b29-query-cache",
    throttleTime: 2000,
    storage: {
      getItem: async (key) => (await get<string>(key, store)) ?? null,
      setItem: async (key, value) => set(key, value, store),
      removeItem: async (key) => del(key, store),
    },
  });

  const [, promise] = persistQueryClient({
    // Cast: the persist packages ship their own copy of the query-core types.
    queryClient: queryClient as never,
    persister,
    maxAge: MAX_AGE,
    buster: `v1-${scope.userId}`,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersist as never },
  });
  void promise;
  unsubscribe = () => {
    void persister.removeClient();
  };
}

/** Called on logout: the cached read-only snapshot must not survive the session. */
export function stopQueryPersistence(): void {
  unsubscribe?.();
  unsubscribe = null;
}
