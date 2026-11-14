import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { path7za } from "7zip-bin";
import os from "node:os";
import path from "node:path";

const temporary = mkdtempSync(path.join(os.tmpdir(), "momentpic-test-"));
if (process.platform !== "win32") chmodSync(path7za, 0o755);
process.env.SQLITE_PATH = path.join(temporary, "test.sqlite");
process.env.CACHE_DIR = path.join(temporary, "cache");
// 逐条读取路径的既有测试默认关闭 7z/RAR 整包解压缓存；缓存本身由 extract-cache.test.ts 用独立实例覆盖
process.env.ARCHIVE_EXTRACT_CACHE_MAX_BYTES ??= "0";
process.env.LIBRARY_ROOTS = path.join(temporary, "library");
process.env.ADMIN_PASSWORD = "Isolated-Test-Only-2026!";
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));
