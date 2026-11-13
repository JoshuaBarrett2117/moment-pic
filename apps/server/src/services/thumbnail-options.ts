import crypto from "node:crypto";

import type { Metadata } from "sharp";

export const DEFAULT_THUMBNAIL_WIDTH = 360;
export const DEFAULT_THUMBNAIL_HEIGHT = 360;
export const MIN_THUMBNAIL_SIZE = 80;
export const MAX_THUMBNAIL_SIZE = 720;

export type ThumbnailFit = "cover" | "inside";
export type ThumbnailFormat = "webp" | "jpeg";
export type PreviewPreset = "low" | "balanced" | "high";
export type ImageVariantKind = "thumbnail" | "preview";

export const PREVIEW_PRESET_OPTIONS: Record<PreviewPreset, { maxWidth: number; maxHeight: number; webpQuality: number; jpegQuality: number }> = {
  low: {
    maxWidth: 1600,
    maxHeight: 1600,
    webpQuality: 70,
    jpegQuality: 72
  },
  balanced: {
    maxWidth: 2560,
    maxHeight: 2560,
    webpQuality: 80,
    jpegQuality: 82
  },
  high: {
    maxWidth: 3840,
    maxHeight: 3840,
    webpQuality: 86,
    jpegQuality: 88
  }
};

export const buildCacheKey = (input: {
  kind: ImageVariantKind;
  sourcePath: string;
  zipEntryPath: string | null;
  sourceMtime: string | null;
  width: number;
  height: number;
  format: ThumbnailFormat;
  quality: number;
  fit?: ThumbnailFit;
}) =>
  crypto
    .createHash("sha1")
    .update(`${input.kind}|${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}|${input.width}x${input.height}|${input.format}|q${input.quality}|fit=${input.fit ?? (input.kind === "preview" ? "inside" : "cover")}|${cacheKeyVersion(input)}`)
    .digest("hex");

const ANIMATED_SOURCE_PATTERN = /\.(gif|webp)$/i;
/** v6：动图缩略图改为只取第一帧，旧的逐帧长条缓存需要失效；其他资产保持 v5，不必重新生成。 */
const cacheKeyVersion = (input: { kind: ImageVariantKind; sourcePath: string; zipEntryPath: string | null }) =>
  input.kind === "thumbnail" && ANIMATED_SOURCE_PATTERN.test(input.zipEntryPath ?? input.sourcePath) ? "v6" : "v5";

export const sanitizeDimension = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value as number);
  return Math.max(MIN_THUMBNAIL_SIZE, Math.min(MAX_THUMBNAIL_SIZE, normalized));
};

export const resolveThumbnailSize = (input?: { width?: number; height?: number }) => {
  const width = sanitizeDimension(input?.width, DEFAULT_THUMBNAIL_WIDTH);
  const height = sanitizeDimension(input?.height, DEFAULT_THUMBNAIL_HEIGHT);
  return { width, height };
};

export const resolveThumbnailFormat = (format?: string): ThumbnailFormat => {
  return format === "webp" ? "webp" : "jpeg";
};

export const resolvePreviewPreset = (preset?: string): PreviewPreset => {
  return preset === "low" || preset === "high" ? preset : "balanced";
};

export const getEncodeQuality = (format: ThumbnailFormat, input: { webpQuality: number; jpegQuality: number }) =>
  format === "webp" ? input.webpQuality : input.jpegQuality;

const hasValidDimension = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const normalizeMetadataDimensions = (metadata: Partial<Pick<Metadata, "width" | "height" | "orientation" | "pageHeight">>): { width: number | null; height: number | null } => {
  const rawWidth = hasValidDimension(metadata.width) ? metadata.width : null;
  // 动图按多帧读取时 height 是所有帧的总高，单帧高度在 pageHeight。
  const frameHeight = hasValidDimension(metadata.pageHeight) ? metadata.pageHeight : metadata.height;
  const rawHeight = hasValidDimension(frameHeight) ? frameHeight : null;

  if (!rawWidth || !rawHeight) {
    return { width: null, height: null };
  }

  const orientation = metadata.orientation ?? 1;
  if (orientation >= 5 && orientation <= 8) {
    return {
      width: rawHeight,
      height: rawWidth
    };
  }

  return {
    width: rawWidth,
    height: rawHeight
  };
};
