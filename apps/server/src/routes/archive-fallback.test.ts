import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { ResourceBusyError } from "../lib/work-budget.js";
import { deleteAlbumDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { authenticateAlbumShare, createAlbumShare } from "../services/album-service.js";
import { archiveBudget, ArchiveDecodeError, ArchiveSafetyError } from "../services/archive/archive-limits.js";

test("真实管理/分享媒体路由遇到预算、取消、超时或上限时不 fallback 重启提取", async (context) => {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const archive = `${env.libraryRootPath}/isolated-${id}.7z`;
  upsertLibraryRootDb({ id, name: id, path: env.libraryRootPath, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb({ id, libraryRootId: id, name: id, sourceType: "zip", sourcePath: archive, sourceMtime: null, assetsFingerprint: null, coverAssetId: id, assetCount: 1, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp }, [{ id, albumId: id, name: "page.jpg", extension: "jpg", sourceType: "zip", sourcePath: archive, relativePath: null, zipEntryPath: "page.jpg", sortIndex: 1, width: 16, height: 16, sizeBytes: null, sourceMtime: null, thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }]);
  const app = buildApp();
  try {
    const share = (await createAlbumShare(id, { password: "route-password", expiresAt: new Date(Date.now() + 60_000).toISOString(), origin: "https://photos.example" }))!;
    const auth = await authenticateAlbumShare(share.token, share.password, id);
    for (const error of [new ResourceBusyError(), new DOMException("请求取消", "AbortError"), new ArchiveSafetyError("ARCHIVE_TIMEOUT", "归档处理超时"), new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "归档解压字节数超过上限"), new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "归档列表超过上限"), new ArchiveDecodeError("RAR 数据损坏")]) {
      let calls = 0;
      context.mock.method(archiveBudget, "acquire", async () => { calls += 1; throw error; });
      for (const variant of ["thumbnail", "preview", "original"]) {
        for (const url of [`/api/v1/assets/${id}/${variant}`, `/api/v1/shares/${share.token}/assets/${id}/${variant}?accessToken=${encodeURIComponent(auth.accessToken)}`]) {
          calls = 0;
          const response = await app.inject({ url, headers: { cookie: `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + 60_000)}` } });
          assert.ok(response.statusCode >= 400);
          assert.equal(calls, 1, `${url} 不可重试 ${error.name}`);
        }
      }
      context.mock.restoreAll();
    }
  } finally { context.mock.restoreAll(); await app.close(); deleteAlbumDb(id); deleteLibraryRootDb(id); }
});
