import sharp from "sharp";

export type SharpInput = Buffer | string;

const SHARP_CACHE_OPTIONS = {
  memory: 32,
  files: 0,
  items: 64
};

sharp.cache(SHARP_CACHE_OPTIONS);
sharp.concurrency(1);

export const createSharp = (input: SharpInput) =>
  sharp(input, {
    animated: true,
    sequentialRead: true,
    failOn: "none"
  });

export const releaseSharpResources = () => {
  sharp.cache(false);
  sharp.cache(SHARP_CACHE_OPTIONS);
};
