import { useEffect, useState } from 'react';
import { albumProgressApi } from '../lib/album-progress';
import type { ContinueReadingDTO } from '../types/api';

export const useContinueReading = (): ContinueReadingDTO[] => {
  const [items, setItems] = useState<ContinueReadingDTO[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void albumProgressApi.continue(controller.signal).then((result) => {
      if (!controller.signal.aborted) setItems(result.items);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return items;
};
