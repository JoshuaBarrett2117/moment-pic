import assert from "node:assert/strict";
import test from "node:test";

import { buildStableAssetId } from "./library-scanner.js";

test("buildStableAssetId returns the same id for the same source asset", () => {
  const input = {
    sourceType: "folder" as const,
    sourcePath: "C:/library/album/image-001.jpg",
    zipEntryPath: null
  };

  assert.equal(buildStableAssetId(input), buildStableAssetId(input));
});

test("buildStableAssetId changes when the archive entry changes", () => {
  const base = {
    sourceType: "zip" as const,
    sourcePath: "C:/library/album.cbz",
    zipEntryPath: "chapter-01/page-01.jpg"
  };

  const next = {
    ...base,
    zipEntryPath: "chapter-01/page-02.jpg"
  };

  assert.notEqual(buildStableAssetId(base), buildStableAssetId(next));
});
