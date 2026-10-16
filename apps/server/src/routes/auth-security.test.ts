import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { validateAdminPassword } from "../config/security.js";
import { authRoutes } from "./auth.js";
import { createAuthToken, isAuthenticated, buildAuthCookie } from "../lib/auth.js";

const password = "Explicit-Test-Password-2026!";

test("真实启动入口在缺失或空配置时退出，不创建数据库也不读取本地凭据文件", async () => {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "startup-security-"));
  const emptyConfig = path.join(directory, "empty-test-config");
  await fs.writeFile(emptyConfig, "");
  try {
    for (const adminPassword of [undefined, ""]) {
      const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, DOTENV_CONFIG_PATH: emptyConfig, SQLITE_PATH: path.join(directory, "must-not-create.sqlite"), CACHE_DIR: path.join(directory, "cache"), LIBRARY_ROOTS: path.join(directory, "library"), PUBLIC_DIR: path.join(directory, "public"), HOST: "127.0.0.1", PORT: "0" };
      if (adminPassword !== undefined) childEnv.ADMIN_PASSWORD = adminPassword;
      const child = spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: fileURLToPath(new URL("../../../../", import.meta.url)), env: childEnv, encoding: "utf8", timeout: 5000 });
      assert.equal(child.status, 1);
      assert.equal(child.signal, null);
      assert.match(child.stderr, /ADMIN_PASSWORD/);
      if (adminPassword) assert.ok(!child.stderr.includes(adminPassword));
      await assert.rejects(fs.stat(childEnv.SQLITE_PATH!), { code: "ENOENT" });
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

const authApp = async (trustProxy: false | string[] = false, adminPassword = password) => {
  const app = Fastify({ trustProxy });
  app.decorate("config", { ...env, adminPassword });
  await app.register(authRoutes);
  return app;
};

test("缺失、空密码及超长密码拒绝启动和直接校验，错误不泄露输入", () => {
  const previous = env.adminPassword;
  try {
    for (const value of [undefined, "", String.fromCharCode(97).repeat(129)]) {
      const checkError = (error: unknown): boolean => {
        assert.ok(error instanceof Error);
        assert.ok(/ADMIN_PASSWORD.*1-128/.test(error.message));
        assert.ok(error.message.includes("非空"));
        assert.ok(error.message.includes("不限制复杂度"));
        if (value) assert.ok(!error.message.includes(value));
        return true;
      };
      env.adminPassword = value ?? "";
      assert.throws(() => buildApp(), checkError);
      assert.throws(() => validateAdminPassword(value), checkError);
    }
  } finally { env.adminPassword = previous; }
});

test("非空的 1-128 字符密码无需复杂度限制，启动和直接校验均保留原值", async () => {
  const previous = env.adminPassword;
  const singleCharacter = String.fromCharCode(97);
  const passwords = [
    singleCharacter,
    singleCharacter.repeat(16),
    Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index)).join(""),
    String.fromCharCode(32).repeat(3),
    singleCharacter.repeat(128)
  ];
  try {
    for (const value of passwords) {
      assert.ok(validateAdminPassword(value) === value);
      env.adminPassword = value;
      const app = buildApp();
      try { assert.ok(app.config.adminPassword === value); }
      finally { await app.close(); }
    }
  } finally { env.adminPassword = previous; }
});

test("Cookie 异常编码与重复 cookie 不抛异常，过期及额外 token 字段无效", () => {
  const valid = createAuthToken(password, Date.now() + 60_000);
  const check = (cookie: string) => isAuthenticated({ headers: { cookie } }, password);
  assert.equal(check(buildAuthCookie(valid, 60)), true);
  assert.equal(check(`other=%ZZ; moment_pic_auth=${valid}`), false);
  assert.equal(check(`moment_pic_auth=${valid}; moment_pic_auth=${valid}`), false);
  assert.equal(check(`moment_pic_auth=${valid}.extra`), false);
  assert.equal(check(`moment_pic_auth=${createAuthToken(password, Date.now() - 1)}`), false);
});

test("实际 HTTP CORS 只允许同源或显式来源，不信任伪造转发 Host", async () => {
  const previous = env.wsAllowedOrigins;
  env.wsAllowedOrigins = ["https://photos.example"];
  const app = buildApp();
  try {
    for (const origin of ["https://photos.example", "http://localhost:80", "https://evil.example", "null", "https://photos.example:444", "https://photos.example/"]) {
      const response = await app.inject({ url: "/api/v1/health", headers: { host: "gallery.local", origin, "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } });
      assert.equal(response.headers["access-control-allow-origin"], origin === "https://photos.example" ? origin : undefined);
      assert.equal(response.headers["access-control-allow-credentials"], origin === "https://photos.example" ? "true" : undefined);
      assert.equal(response.headers.vary, "Origin");
    }
    const sameOrigin = await app.inject({ url: "/api/v1/health", headers: { host: "gallery.local:3001", origin: "http://gallery.local:3001" } });
    assert.equal(sameOrigin.headers["access-control-allow-origin"], "http://gallery.local:3001");
  } finally { await app.close(); env.wsAllowedOrigins = previous; }
});

test("登录按真实 IP 限流，伪造转发 IP 不可绕过；合法密码成功且有长度上限", async () => {
  const app = await authApp();
  try {
    const login = (input: string, forwarded = "") => app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-forwarded-for": forwarded }, payload: { username: "admin", password: input } });
    assert.equal((await login(password)).statusCode, 200);
    for (let index = 0; index < 9; index += 1) assert.equal((await login("wrong", `1.2.3.${index}`)).statusCode, 401);
    assert.equal((await login(password, "8.8.8.8")).statusCode, 429);
  } finally { await app.close(); }
  const longApp = await authApp(false, "a".repeat(129));
  try {
    assert.equal((await longApp.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "admin", password: "a".repeat(129) } })).statusCode, 401);
  } finally { await longApp.close(); }
});

test("只有显式信任的代理可以声明 HTTPS，登录和注销 cookie 均启用 Secure", async () => {
  for (const trusted of [false, ["127.0.0.1"]] as const) {
    const app = await authApp(trusted === false ? false : [...trusted]);
    try {
      for (const route of ["login", "logout"]) {
        const response = await app.inject({ method: "POST", url: `/api/v1/auth/${route}`, remoteAddress: "127.0.0.1", headers: { "x-forwarded-proto": "https" }, payload: { username: "admin", password } });
        assert.equal(String(response.headers["set-cookie"]).includes("; Secure"), trusted !== false);
      }
      const spoofed = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: "192.0.2.5", headers: { "x-forwarded-proto": "https" }, payload: { username: "admin", password } });
      assert.ok(!String(spoofed.headers["set-cookie"]).includes("; Secure"));
    } finally { await app.close(); }
  }
});
