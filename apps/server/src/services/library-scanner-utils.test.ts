import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetsFingerprint, buildStableAssetId, mapWithConcurrency, sortNames } from "./library-scanner-utils.js";

test("并发 mapper 的 falsy rejection 仍传播失败", async () => {
  for (const reason of [undefined, null, 0, "", false]) {
    let rejected = false;
    try { await mapWithConcurrency([1], 1, () => Promise.reject(reason)); }
    catch (error) { rejected = true; assert.equal(error, reason); }
    assert.equal(rejected, true);
  }
});

test("mapWithConcurrency preserves item order and drops only explicit null results", async () => {
  const results = await mapWithConcurrency([1, 2, 3, 4], 64, async (value) => {
    if (value === 2) {
      return null;
    }

    if (value === 4) return null;

    return value * 10;
  });

  assert.deepEqual(results, [10, 30]);
});

test("mapWithConcurrency propagates individual failures after workers settle", async () => {
  await assert.rejects(mapWithConcurrency([1, 2], 2, async () => { throw new Error("stat failed"); }), /stat failed/);
});

test("sortNames uses numeric-aware zh-Hans ordering", () => {
  const names = ["第10页.jpg", "第2页.jpg", "第1页.jpg"];
  assert.deepEqual([...names].sort(sortNames), ["第1页.jpg", "第2页.jpg", "第10页.jpg"]);
});

test("buildAssetsFingerprint changes when asset ordering metadata changes", () => {
  const asset = {
    name: "001.jpg",
    extension: "jpg",
    relativePath: "album/001.jpg",
    zipEntryPath: null,
    sortIndex: 1,
    sizeBytes: "100",
    sourceMtime: "123"
  };

  assert.equal(buildAssetsFingerprint([asset]), buildAssetsFingerprint([asset]));
  assert.notEqual(buildAssetsFingerprint([asset]), buildAssetsFingerprint([{ ...asset, sortIndex: 2 }]));
});

test("buildStableAssetId returns deterministic source-based ids", () => {
  const input = {
    sourceType: "folder" as const,
    sourcePath: "C:/library/album/image-001.jpg",
    zipEntryPath: null
  };

  assert.equal(buildStableAssetId(input), buildStableAssetId(input));
  assert.notEqual(buildStableAssetId(input), buildStableAssetId({ ...input, zipEntryPath: "page-2.jpg" }));
});
