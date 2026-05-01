import type { RedisClientType } from "redis";

import type { CacheStore } from "./cache-store.js";

export class RedisCacheStore implements CacheStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly prefix = "moment-pic:cache:"
  ) {}

  private buildKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(this.buildKey(key));
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(this.buildKey(key), JSON.stringify(value), {
      EX: Math.max(1, ttlSeconds)
    });
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.buildKey(key));
  }

  async delByPrefix(prefix: string): Promise<void> {
    const keys = await this.client.keys(this.buildKey(`${prefix}*`));
    if (keys.length === 0) {
      return;
    }
    await this.client.del(keys);
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length === 0) {
      return;
    }
    await this.client.del(keys);
  }
}
