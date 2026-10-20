/**
 * Utility for caching dashboard data in localStorage with error tolerance
 */

export async function getBrowserCache<T>(key: string): Promise<T | null> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[browserCache] Failed to get cache for key "${key}":`, err);
    return null;
  }
}

export async function setBrowserCache<T>(key: string, value: T): Promise<void> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
  } catch (err) {
    // QuotaExceededError or security restrictions
    console.warn(`[browserCache] Failed to set cache for key "${key}":`, err);
    try {
      // Clear older large keys if quota exceeded
      window.localStorage.removeItem(key);
    } catch (_) {}
  }
}

export function removeLegacyLocalCache(...keys: string[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch (_) {}
}

export async function removeBrowserCache(...keys: string[]): Promise<void> {
  removeLegacyLocalCache(...keys);
}
