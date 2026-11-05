// Shared IndexedDB cache for downloaded data (weather years, station lists, station years).
// Typed arrays are stored as-is, so cached data stays compact.

const DB_NAME = "site-estimator-weather";
const DB_VERSION = 1;
const STORE = "weather";

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

export async function dbGet(key): Promise<any> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/** Best effort: quota errors and private browsing just skip caching. */
export async function dbPut(key, value) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
  } catch {
    /* skip caching */
  }
}

export async function dbClear() {
  const db = await openDb();
  if (db) db.transaction(STORE, "readwrite").objectStore(STORE).clear();
}

/** In-memory cache of station lists, station years and elevations (cleared by clearStationMemory). */
export const memory = new Map();
