import type { CacheStore } from "./cache-store.js";

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export class MemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const current = this.store.get(key);
    if (!current) {
      return null;
    }

    if (current.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return current.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
