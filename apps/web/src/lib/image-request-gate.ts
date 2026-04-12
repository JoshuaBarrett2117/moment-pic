const MAX_CONCURRENT_IMAGE_REQUESTS = 8;

let activeSlots = 0;
const waitQueue: Array<(release: () => void) => void> = [];

const createRelease = (): (() => void) => {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    activeSlots = Math.max(0, activeSlots - 1);
    const next = waitQueue.shift();
    if (next) {
      activeSlots += 1;
      next(createRelease());
    }
  };
};

export const acquireImageRequestSlot = async (): Promise<() => void> => {
  if (activeSlots < MAX_CONCURRENT_IMAGE_REQUESTS) {
    activeSlots += 1;
    return createRelease();
  }

  return new Promise((resolve) => {
    waitQueue.push(resolve);
  });
};

