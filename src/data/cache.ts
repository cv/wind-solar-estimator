// Shared IndexedDB cache for downloaded data (weather years, station lists, station years).
// Typed arrays are stored as-is, so cached data stays compact.

const DB_NAME = "site-estimator-weather";
const DB_VERSION = 1;
const STORE = "weather";

let dbPromise: Promise<IDBDatabase | null> | null = null;

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener("upgradeneeded", () => req.result.createObjectStore(STORE));
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => resolve(null));
  });
  return dbPromise;
}

/** The value stored under key if it passes the guard, or null when absent, unavailable or of another shape. */
export async function dbGet<T>(key: string, guard: (v: unknown) => v is T): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.addEventListener("success", () => {
      const value: unknown = req.result;
      resolve(guard(value) ? value : null);
    });
    req.addEventListener("error", () => resolve(null));
  });
}

/** Best effort: quota errors and private browsing just skip caching. */
export async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
  } catch {
    /* skip caching */
  }
}

export async function dbClear(): Promise<void> {
  const db = await openDb();
  if (db) db.transaction(STORE, "readwrite").objectStore(STORE).clear();
}

/**
 * In-memory cache of station lists, station years and elevations (cleared by clearStationMemory).
 * Values differ by key prefix, so readers check them with memoryGet and a guard.
 */
export const memory = new Map<string, unknown>();

/** The in-memory value under key if it passes the guard, else undefined. */
export function memoryGet<T>(key: string, guard: (v: unknown) => v is T): T | undefined {
  const value = memory.get(key);
  return guard(value) ? value : undefined;
}
