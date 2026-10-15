import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { insertAlbumWithAssetsDb, deleteAlbumDb } from "../repositories/album-repository.js";
import { upsertLibraryRootDb, deleteLibraryRootDb } from "../repositories/library-root-repository.js";
import { authenticateAlbumShare, createAlbumShare } from "../services/album-service.js";
import { archiveBudget } from "../services/archive/archive-limits.js";

test("真实 HTTP 管理/分享原图断开，取消传播到提取子进程并回收全局预算", { skip: process.platform === "win32" }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "media-disconnect-"));
  const previousPath = process.env.PATH;
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const archive = path.join(directory, "book.7z");
  const pidFile = archive + ".pid";
  const executable = path.join(directory, "7zz");
  await fs.writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs');const archive=process.argv.find(value=>value.endsWith('.7z'));fs.writeFileSync(archive+'.pid',String(process.pid));const timer=setInterval(()=>{if(!process.stdout.write(Buffer.alloc(8192,65))) {clearInterval(timer);process.stdout.once('drain',()=>setInterval(()=>process.stdout.write(Buffer.alloc(8192,65)),10));}},10);\n`, { mode: 0o755 });
  process.env.PATH = directory + path.delimiter + previousPath;
  upsertLibraryRootDb({ id, name: id, path: directory, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb({ id, libraryRootId: id, name: id, sourceType: "zip", sourcePath: archive, sourceMtime: null, assetsFingerprint: null, coverAssetId: id, assetCount: 1, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp }, [{ id, albumId: id, name: "page.jpg", extension: "jpg", sourceType: "zip", sourcePath: archive, relativePath: null, zipEntryPath: "page.jpg", sortIndex: 1, width: null, height: null, sizeBytes: null, sourceMtime: null, thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }]);
  const app = buildApp();
  try {
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const share = (await createAlbumShare(id, { password: "Http-Share-Test!", expiresAt: new Date(Date.now() + 60_000).toISOString(), origin }))!;
    const auth = await authenticateAlbumShare(share.token, share.password, id);
    for (const url of [`/api/v1/assets/${id}/original`, `/api/v1/shares/${share.token}/assets/${id}/original?accessToken=${encodeURIComponent(auth.accessToken)}`]) {
      await new Promise<void>((resolve, reject) => {
        const request = http.get(origin + url, { headers: { cookie: `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + 60_000)}` } }, (response) => {
          assert.equal(response.statusCode, 200);
          response.once("data", () => { response.destroy(); request.destroy(); resolve(); });
          response.on("error", () => {});
        });
        request.on("error", reject);
      });
      const pid = Number(await fs.readFile(pidFile, "utf8"));
      for (let index = 0; index < 100 && archiveBudget.usage.active; index += 1) await delay(10);
      assert.deepEqual(archiveBudget.usage, { active: 0, queued: 0 });
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally {
    await app.close();
    process.env.PATH = previousPath;
    deleteAlbumDb(id); deleteLibraryRootDb(id);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
