import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ALBUM_LIST_CACHE_MAX_ENTRIES, clearAlbumListCache, getAlbumListCacheSize, listAlbums } from "./album-service.js";
import { getSmartAlbumRebuildTask, getSmartAlbumRebuildTaskCount, MAX_FINISHED_REBUILD_TASKS, startSmartAlbumRebuildTask } from "./smart-album-rebuild-service.js";

test("相册列表缓存写入时清过期并封顶", async () => {
  clearAlbumListCache();
  for (let pageSize = 1; pageSize <= ALBUM_LIST_CACHE_MAX_ENTRIES + 50; pageSize++) await listAlbums({ page: 1, pageSize });
  assert.ok(getAlbumListCacheSize() <= ALBUM_LIST_CACHE_MAX_ENTRIES);
  clearAlbumListCache();
  assert.equal(getAlbumListCacheSize(), 0);
});

test("智能相册重建任务表只保留最近的已结束任务", async () => {
  for (let i = 0; i < MAX_FINISHED_REBUILD_TASKS + 10; i++) {
    const task = startSmartAlbumRebuildTask();
    for (let wait = 0; wait < 200; wait++) {
      const status = getSmartAlbumRebuildTask(task.taskId)?.status;
      if (status === "completed" || status === "failed") break;
      await delay(5);
    }
  }
  assert.ok(getSmartAlbumRebuildTaskCount() <= MAX_FINISHED_REBUILD_TASKS + 1);
});
