import sharp from "sharp";

export type SharpInput = Buffer | string;

const SHARP_CACHE_OPTIONS = {
  memory: 32,
  files: 0,
  items: 64
};

sharp.cache(SHARP_CACHE_OPTIONS);
sharp.concurrency(1);

/**
 * 默认只读第一帧：缩略图与尺寸探测不需要动画，逐帧处理会让 GIF 缩略图慢几十倍，
 * 且 metadata().height 会变成所有帧的总高。需要保留动画时显式传 { animated: true }。
 */
export const createSharp = (input: SharpInput, options: { animated?: boolean } = {}) =>
  sharp(input, {
    animated: options.animated ?? false,
    sequentialRead: true,
    failOn: "none"
  });

export const releaseSharpResources = () => {
  sharp.cache(false);
  sharp.cache(SHARP_CACHE_OPTIONS);
};
