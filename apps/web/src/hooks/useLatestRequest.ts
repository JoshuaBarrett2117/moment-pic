import { useCallback, useEffect, useMemo, useRef } from 'react';

export const isRequestCancellation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: string };
  return candidate.name === 'AbortError' || candidate.name === 'CanceledError' || candidate.code === 'ERR_CANCELED';
};

export function useLatestRequest() {
  const current = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);
  const begin = useCallback(() => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return { signal: controller.signal, isCurrent: () => current.current === controller };
  }, []);
  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ begin, cancel }), [begin, cancel]);
}
