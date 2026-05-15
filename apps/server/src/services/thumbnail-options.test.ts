import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCacheKey,
  getEncodeQuality,
  normalizeMetadataDimensions,
  resolvePreviewPreset,
  resolveThumbnailFormat,
  resolveThumbnailSize,
  sanitizeDimension
} from "./thumbnail-options.js";

test("thumbnail option helpers clamp dimensions and format inputs", () => {
  assert.equal(sanitizeDimension(Number.NaN, 360), 360);
  assert.equal(sanitizeDimension(40, 360), 80);
  assert.equal(sanitizeDimension(800, 360), 720);
  assert.deepEqual(resolveThumbnailSize({ width: 233.9, height: undefined }), { width: 233, height: 360 });
  assert.equal(resolveThumbnailFormat("webp"), "webp");
  assert.equal(resolveThumbnailFormat("png"), "jpeg");
});

test("preview preset and quality helpers normalize unsupported inputs", () => {
  assert.equal(resolvePreviewPreset("low"), "low");
  assert.equal(resolvePreviewPreset("high"), "high");
  assert.equal(resolvePreviewPreset("unexpected"), "balanced");
  assert.equal(getEncodeQuality("webp", { webpQuality: 80, jpegQuality: 82 }), 80);
  assert.equal(getEncodeQuality("jpeg", { webpQuality: 80, jpegQuality: 82 }), 82);
});

test("buildCacheKey is deterministic and sensitive to variant options", () => {
  const base = {
    kind: "thumbnail" as const,
    sourcePath: "C:/photos/a.jpg",
    zipEntryPath: null,
    sourceMtime: "2026-05-15T00:00:00.000Z",
    width: 360,
    height: 360,
    format: "jpeg" as const,
    quality: 82
  };

  assert.equal(buildCacheKey(base), buildCacheKey(base));
  assert.notEqual(buildCacheKey(base), buildCacheKey({ ...base, format: "webp", quality: 80 }));
});

test("normalizeMetadataDimensions respects EXIF rotated orientations", () => {
  assert.deepEqual(normalizeMetadataDimensions({ width: 1200, height: 800, orientation: 1 }), { width: 1200, height: 800 });
  assert.deepEqual(normalizeMetadataDimensions({ width: 1200, height: 800, orientation: 6 }), { width: 800, height: 1200 });
  assert.deepEqual(normalizeMetadataDimensions({ width: undefined, height: 800 }), { width: null, height: null });
});
