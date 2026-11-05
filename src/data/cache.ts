// Shared IndexedDB cache for downloaded data (weather years, station lists, station years).
// Typed arrays are stored as-is, so cached data stays compact.

const DB_NAME = "site-estimator-weather";
const DB_VERSION = 1;
const STORE = "weather";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

/** The value stored under key (the caller names its type), or null when absent or unavailable. */
export async function dbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) || null);
    req.onerror = () => resolve(null);
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
 * Values differ by key prefix, so readers state the type they stored.
 */
export const memory = new Map<string, unknown>();
