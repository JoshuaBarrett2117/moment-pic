import { spawnSync } from "node:child_process";

const cargoVersion = spawnSync("cargo", ["--version"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (cargoVersion.error || cargoVersion.status !== 0) {
  console.warn("跳过 Rust 测试：当前环境未安装或未暴露 cargo。");
  process.exit(0);
}

const result = spawnSync("cargo", ["test", "--manifest-path", "apps/server-rs/Cargo.toml"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: "inherit"
});

process.exit(result.status ?? 1);
