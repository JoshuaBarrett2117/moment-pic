import fs from "node:fs";
import path from "node:path";
import { makeId } from "../repositories/ids.js";
import { findLibraryRootByPathDb, listLibraryRootsDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import type { LibraryRootRecord } from "../types/store.js";

export interface LibraryRootSeedResult {
  added: LibraryRootRecord[];
  skipped: { path: string; reason: string }[];
}

const normalize = (target: string) => path.resolve(target).replace(/[\\/]+$/, "") || "/";

/**
 * 启动时把 LIBRARY_ROOTS 中的目录登记为图库目录。
 * - 只新增：已登记的目录（含被禁用的）保持原样，不改名、不重新启用；
 * - 不存在或不是目录的路径跳过并返回原因，避免登记一个必然扫描失败的根目录；
 * - 不删除设置页里手动添加的目录。
 */
export const seedLibraryRootsFromEnv = (paths: readonly string[]): LibraryRootSeedResult => {
  const result: LibraryRootSeedResult = { added: [], skipped: [] };
  const known = new Set(listLibraryRootsDb().map((root) => normalize(root.path)));
  for (const raw of paths) {
    const target = normalize(raw);
    if (known.has(target) || findLibraryRootByPathDb(target)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      result.skipped.push({ path: target, reason: "目录不存在或无权访问" });
      continue;
    }
    if (!stat.isDirectory()) {
      result.skipped.push({ path: target, reason: "不是目录" });
      continue;
    }
    const timestamp = new Date().toISOString();
    const root: LibraryRootRecord = {
      id: makeId("root"),
      name: path.basename(target) || target,
      path: target,
      enabled: true,
      lastScannedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    upsertLibraryRootDb(root);
    known.add(target);
    result.added.push(root);
  }
  return result;
};
