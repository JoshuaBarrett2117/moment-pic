import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { path7za } from "7zip-bin";
import os from "node:os";
import path from "node:path";

const temporary = mkdtempSync(path.join(os.tmpdir(), "momentpic-test-"));
if (process.platform !== "win32") chmodSync(path7za, 0o755);
process.env.SQLITE_PATH = path.join(temporary, "test.sqlite");
process.env.CACHE_DIR = path.join(temporary, "cache");
process.env.INDEX_FILE_PATH = path.join(temporary, "index.json");
process.env.LIBRARY_ROOTS = path.join(temporary, "library");
process.env.ADMIN_PASSWORD = "Isolated-Test-Only-2026!";
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));
