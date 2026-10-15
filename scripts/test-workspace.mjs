import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTests } from "./discover-tests.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = process.argv[2];
if (!["server", "web"].includes(workspace)) throw new Error("必须指定 server 或 web");
const files = await discoverTests(path.join(root, "apps", workspace, "src"));
if (!files.length) throw new Error("未发现测试，拒绝空测试通过");
console.log(`递归发现 ${workspace} 测试文件 ${files.length} 个`);
for (const file of files) console.log(path.relative(root, file));
const result = spawnSync(process.execPath, [
  "--import", path.join(root, "scripts/test-isolation.mjs"),
  "--import", "tsx", "--test", "--test-concurrency=1", ...files
], { cwd: root, stdio: "inherit", env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, "apps", workspace, "tsconfig.json") } });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
