import crypto from "node:crypto";

import type sharp from "sharp";

export const DEFAULT_THUMBNAIL_WIDTH = 360;
export const DEFAULT_THUMBNAIL_HEIGHT = 360;
export const MIN_THUMBNAIL_SIZE = 80;
export const MAX_THUMBNAIL_SIZE = 720;

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
}) =>
  crypto
    .createHash("sha1")
    .update(`${input.kind}|${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}|${input.width}x${input.height}|${input.format}|q${input.quality}|v4`)
    .digest("hex");

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

export const normalizeMetadataDimensions = (metadata: sharp.Metadata): { width: number | null; height: number | null } => {
  const rawWidth = hasValidDimension(metadata.width) ? metadata.width : null;
  const rawHeight = hasValidDimension(metadata.height) ? metadata.height : null;

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
