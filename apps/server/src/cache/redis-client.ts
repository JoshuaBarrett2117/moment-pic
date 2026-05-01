import { createClient, type RedisClientType } from "redis";

import { env } from "../config/env.js";

let redisClient: RedisClientType | null = null;

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    redisClient = createClient({
      url: env.redisUrl,
      socket: {
        reconnectStrategy: false,
        connectTimeout: 10000
      }
    });
  }

  return redisClient;
};

export const verifyRedisConnectivity = async (): Promise<void> => {
  const client = getRedisClient();
  if (!client.isOpen) {
    await client.connect();
  }
  await client.ping();
};

export const closeRedisClient = async (): Promise<void> => {
  if (!redisClient) {
    return;
  }

  const client = redisClient;
  redisClient = null;
  if (client.isOpen) {
    await client.quit();
  }
};
