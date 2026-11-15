import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { NetworkKind } from '../lib/viewer-quality';

export type NetworkInfo = { network: NetworkKind; clientIp: string };

const CACHE_TTL_MS = 60_000;
let cached: { value: NetworkInfo; at: number } | null = null;
let inflight: Promise<NetworkInfo | null> | null = null;

/** 拉取 /api/v1/network（需登录），同一页面 60 秒内复用结果；失败返回 null（调用方按外网处理）。 */
export const fetchNetworkInfo = (force = false): Promise<NetworkInfo | null> => {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.value);
  if (inflight) return inflight;
  inflight = api.get<NetworkInfo>('/network')
    .then((value) => {
      if (!value || (value.network !== 'lan' && value.network !== 'wan')) return null;
      cached = { value, at: Date.now() };
      return value;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
};

/** 测试用 */
export const resetNetworkInfoCache = (): void => { cached = null; inflight = null; };

export const useNetworkInfo = (enabled = true): { info: NetworkInfo | null; loaded: boolean } => {
  const [state, setState] = useState<{ info: NetworkInfo | null; loaded: boolean }>(() => ({ info: cached?.value ?? null, loaded: Boolean(cached) }));
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchNetworkInfo().then((info) => {
      if (!cancelled) setState({ info, loaded: true });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
};
