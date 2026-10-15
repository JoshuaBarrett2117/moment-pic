import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import * as service from "./album-service.js";
import { insertAlbumWithAssetsDb, deleteAlbumDb, findAlbumShareByTokenDb } from "../repositories/album-repository.js";
import { upsertLibraryRootDb, deleteLibraryRootDb } from "../repositories/library-root-repository.js";
import { getDb } from "../db/sqlite.js";
import { sharePasswords } from "./share-password.js";

const fixture = async () => {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, name: id, path: `/isolated-test/${id}`, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb({ id, libraryRootId: id, name: "安全测试相册", sourceType: "folder", sourcePath: `/isolated-test/${id}`, sourceMtime: null, assetsFingerprint: null, coverAssetId: null, assetCount: 0, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp }, []);
  const share = (await service.createAlbumShare(id, { password: "Share-Test-Password!", expiresAt: new Date(Date.now() + 3600_000).toISOString(), origin: "https://photos.example" }))!;
  return { id, share, cleanup: () => { deleteAlbumDb(id); deleteLibraryRootDb(id); } };
};

test("新分享只持久化哈希、只创建时返回密码，列表即使存在历史明文也不返回", async () => {
  const data = await fixture();
  try {
    const row = getDb().prepare("SELECT * FROM album_shares WHERE token = ?").get(data.share.token) as Record<string, unknown>;
    assert.equal(row.password_plain ?? "", "");
    assert.match(String(row.password_hash), /^[a-f\d]{32}:[a-f\d]{128}$/);
    assert.equal(data.share.password, "Share-Test-Password!");
    const columns = getDb().prepare("PRAGMA table_info(album_shares)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "password_plain")) getDb().exec("ALTER TABLE album_shares ADD COLUMN password_plain TEXT NOT NULL DEFAULT ''");
    getDb().prepare("UPDATE album_shares SET password_plain = ? WHERE token = ?").run("legacy-fixture-only", data.share.token);
    const listed = await service.listManagedAlbumShares("https://photos.example");
    assert.ok(!JSON.stringify(listed).includes("legacy-fixture-only"));
    assert.ok(!JSON.stringify(listed).includes('"password"'));
    const listedRow = listed.items.find((item) => item.token === data.share.token)!;
    assert.ok(listedRow);
    assert.ok(!Object.hasOwn(findAlbumShareByTokenDb(data.share.token)!, "passwordPlain"));
  } finally { data.cleanup(); }
});

for (const change of ["revoke", "reset", "expire"] as const) {
  test(`异步密码校验等待中 ${change} 后不得签发分享会话`, async (context) => {
    const data = await fixture();
    let finish!: (valid: boolean) => void;
    context.mock.method(sharePasswords, "verify", () => new Promise<boolean>((resolve) => { finish = resolve; }));
    try {
      const share = findAlbumShareByTokenDb(data.share.token)!;
      const auth = service.authenticateAlbumShare(data.share.token, data.share.password, crypto.randomUUID());
      const rejected = assert.rejects(auth, change === "reset" ? service.AlbumSharePasswordInvalidError : service.AlbumShareNotFoundError);
      if (change === "revoke") await service.deleteManagedAlbumShare(share.id);
      if (change === "reset") await service.resetManagedAlbumSharePassword(share.id, "changed-in-flight");
      if (change === "expire") getDb().prepare("UPDATE album_shares SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), share.id);
      finish(true);
      await rejected;
    } finally { context.mock.restoreAll(); data.cleanup(); }
  });
}

test("公开认证不阻塞事件循环，正常/错误密码有明确行为及长度限制", async () => {
  const data = await fixture();
  try {
    let responsive = false;
    const timer = setTimeout(() => { responsive = true; }, 0);
    const result = await service.authenticateAlbumShare(data.share.token, data.share.password, crypto.randomUUID());
    clearTimeout(timer);
    assert.equal(responsive, true);
    assert.ok(result.accessToken);
    await assert.rejects(service.authenticateAlbumShare(data.share.token, "wrong", crypto.randomUUID()), service.AlbumSharePasswordInvalidError);
    await assert.rejects(service.authenticateAlbumShare(data.share.token, "x".repeat(129), crypto.randomUUID()), service.AlbumSharePasswordInvalidError);
  } finally { data.cleanup(); }
});

test("按 IP 与分享分别计数，换链接/换 IP 都不能绕过限制", async () => {
  const data = await fixture();
  try {
    const ip = crypto.randomUUID();
    for (let index = 0; index < 20; index += 1) await assert.rejects(service.authenticateAlbumShare(`missing-${crypto.randomUUID()}`, "wrong", ip));
    await assert.rejects(service.authenticateAlbumShare(data.share.token, data.share.password, ip), { statusCode: 429 });
    for (let index = 0; index < 9; index += 1) await assert.rejects(service.authenticateAlbumShare(data.share.token, "wrong", crypto.randomUUID()), service.AlbumSharePasswordInvalidError);
    await assert.rejects(service.authenticateAlbumShare(data.share.token, data.share.password, crypto.randomUUID()), { statusCode: 429 });
  } finally { data.cleanup(); }
});

test("重置只更新哈希，立即撤销既有分享访问令牌，旧密码失效", async () => {
  const data = await fixture();
  try {
    const auth = await service.authenticateAlbumShare(data.share.token, data.share.password, crypto.randomUUID());
    assert.ok(await service.getSharedAlbumAssets(data.share.token, auth.accessToken));
    const share = findAlbumShareByTokenDb(data.share.token)!;
    assert.equal(await service.resetManagedAlbumSharePassword(share.id, "New-Share-Test-Password!"), true);
    assert.equal(await service.getSharedAlbumAssets(data.share.token, auth.accessToken), null);
    await assert.rejects(service.authenticateAlbumShare(data.share.token, data.share.password, crypto.randomUUID()), service.AlbumSharePasswordInvalidError);
    assert.ok(await service.authenticateAlbumShare(data.share.token, "New-Share-Test-Password!", crypto.randomUUID()));
  } finally { data.cleanup(); }
});
