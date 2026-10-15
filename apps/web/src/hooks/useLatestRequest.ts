import { useCallback, useEffect, useMemo, useRef } from 'react';

export const isRequestCancellation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: string };
  return candidate.name === 'AbortError' || candidate.name === 'CanceledError' || candidate.code === 'ERR_CANCELED';
};

export function useLatestRequest(onCancel?: () => void) {
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
    if (mounted.current) onCancelRef.current?.();
  }, []);
  const begin = useCallback(() => {
    current.current?.abort();
    const controller = new AbortController();
    if (!mounted.current) {
      controller.abort();
      return { signal: controller.signal, isCurrent: () => false };
    }
    current.current = controller;
    return { signal: controller.signal, isCurrent: () => current.current === controller };
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);
  return useMemo(() => ({ begin, cancel }), [begin, cancel]);
}
