import crypto from "node:crypto";

import type { SourceType } from "../types/store.js";

export type ScannedAssetForFingerprint = {
  name: string;
  extension: string;
  relativePath: string | null;
  zipEntryPath: string | null;
  sortIndex: number;
  sizeBytes: string | null;
  sourceMtime: string | null;
};

export const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R | null>
): Promise<R[]> => {
  const safeConcurrency = Math.max(1, Math.min(concurrency, 32));
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index]);
      } catch {
        results[index] = null;
      }
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results.filter((item): item is R => item !== null);
};

export const sortNames = (left: string, right: string): number =>
  left.localeCompare(right, "zh-Hans-CN-u-kn-true");

export const buildAssetsFingerprint = (assets: ScannedAssetForFingerprint[]): string =>
  crypto
    .createHash("sha1")
    .update(
      assets
        .map((asset) =>
          [
            asset.name,
            asset.extension,
            asset.relativePath ?? "",
            asset.zipEntryPath ?? "",
            String(asset.sortIndex),
            asset.sizeBytes ?? "",
            asset.sourceMtime ?? ""
          ].join("|")
        )
        .join("\n")
    )
    .digest("hex");

export const buildStableAssetId = (asset: {
  sourceType: SourceType;
  sourcePath: string;
  zipEntryPath: string | null;
}): string => {
  const hash = crypto
    .createHash("sha1")
    .update([asset.sourceType, asset.sourcePath, asset.zipEntryPath ?? ""].join("|"))
    .digest("hex");

  return `ast_${hash.slice(0, 32)}`;
};
