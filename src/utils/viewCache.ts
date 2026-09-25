type Entry<T> = { value: T; at: number };

const store = new Map<string, Entry<unknown>>();
const MAX_AGE_MS = 10 * 60 * 1000;

export function readViewCache<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function writeViewCache<T>(key: string, value: T) {
  store.set(key, { value, at: Date.now() });
}

export function clearViewCache() {
  store.clear();
}
