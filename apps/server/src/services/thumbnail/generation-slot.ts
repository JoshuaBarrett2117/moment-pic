const THUMBNAIL_GENERATION_CONCURRENCY = 1;

let activeGenerationCount = 0;
const generationWaitQueue: Array<() => void> = [];

export const withGenerationSlot = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (activeGenerationCount >= THUMBNAIL_GENERATION_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      generationWaitQueue.push(resolve);
    });
  }

  activeGenerationCount += 1;
  try {
    return await fn();
  } finally {
    activeGenerationCount = Math.max(0, activeGenerationCount - 1);
    const next = generationWaitQueue.shift();
    if (next) {
      next();
    }
  }
};
