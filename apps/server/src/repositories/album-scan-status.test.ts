import assert from "node:assert/strict";
import test from "node:test";
import { getDb } from "../db/sqlite.js";
import { updateAlbumScanStatusBatchDb } from "./album-repository.js";

test("4192 行状态更新按 DBA 上限分 5 个事务，重复状态零写入且不改 updated_at", (context) => {
  const db = getDb();
  const insert = db.prepare(`INSERT INTO albums (id, library_root_id, name, source_type, source_path, asset_count, scan_status, created_at, updated_at)
    VALUES (?, 'status-root', 'status', 'folder', ?, 0, 'ready', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`);
  db.transaction(() => { for (let i = 0; i < 4192; i++) insert.run(`status-${i}`, `/status-${i}`); })();
  const exec = context.mock.method(db, "exec");
  // better-sqlite3 transaction uses prepared BEGIN/COMMIT statements, inspect inTransaction at each UPDATE instead.
  const original = db.prepare.bind(db);
  let batches = 0;
  const transaction = db.transaction.bind(db);
  context.mock.method(db, "transaction", (fn: (...args: unknown[]) => unknown) => transaction((...args: unknown[]) => { batches++; assert.equal(db.inTransaction, true); return fn(...args); }));
  const updates = Array.from({ length: 4192 }, (_, i) => ({ albumId: `status-${i}`, status: "error" as const, message: "失败" }));
  assert.equal(updateAlbumScanStatusBatchDb(updates), 4192);
  assert.equal(batches, 5);
  assert.equal(updateAlbumScanStatusBatchDb(updates), 0);
  assert.equal(batches, 10);
  assert.equal((original("SELECT COUNT(*) AS n FROM albums WHERE updated_at = '2026-01-01T00:00:00.000Z'").get() as { n: number }).n, 4192);
  assert.equal(exec.mock.callCount(), 0);
});
