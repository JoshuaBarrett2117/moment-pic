import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { ensureInitialAdmin } from "../services/auth-service.js";

const login = async (app: ReturnType<typeof buildApp>, username: string, password: string) => {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
  const cookie = String(response.headers["set-cookie"] ?? "").split(";")[0];
  return { status: response.statusCode, cookie, body: response.json() };
};

test("登录签发服务端会话；登出立即吊销，旧 cookie 不能再用", async () => {
  const app = buildApp();
  try {
    const session = await login(app, "admin", env.adminPassword);
    assert.equal(session.status, 200);
    assert.equal(session.body.data.user.role, "admin");
    assert.equal((await app.inject({ url: "/api/v1/auth/session", headers: { cookie: session.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie: session.cookie }, payload: {} })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/v1/albums", headers: { cookie: session.cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test("在页面修改用户名和密码：需当前密码，改密后其他会话失效、当前会话保留", async () => {
  const app = buildApp();
  try {
    const first = await login(app, "admin", env.adminPassword);
    const second = await login(app, "admin", env.adminPassword);
    const wrong = await app.inject({ method: "PATCH", url: "/api/v1/account", headers: { cookie: first.cookie }, payload: { currentPassword: "nope", newPassword: "x" } });
    assert.equal(wrong.statusCode, 403);
    const changed = await app.inject({ method: "PATCH", url: "/api/v1/account", headers: { cookie: first.cookie }, payload: { currentPassword: env.adminPassword, username: "owner", newPassword: "新的密码 123" } });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().data.username, "owner");
    assert.equal((await app.inject({ url: "/api/v1/albums", headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/v1/albums", headers: { cookie: second.cookie } })).statusCode, 401);
    assert.equal((await login(app, "admin", env.adminPassword)).status, 401);
    assert.equal((await login(app, "OWNER", "新的密码 123")).status, 200);
    // 重启后 ADMIN_PASSWORD 不会覆盖页面上改过的密码
    ensureInitialAdmin(env.adminPassword);
    assert.equal((await login(app, "owner", "新的密码 123")).status, 200);
    // 忘记密码救援：ADMIN_PASSWORD_RESET
    ensureInitialAdmin(env.adminPassword, { reset: true });
    assert.equal((await login(app, "owner", env.adminPassword)).status, 200);
  } finally { await app.close(); }
});

test("多用户：管理员可增删改用户；viewer 只读，不能扫描、改设置或管理用户；始终保留一个管理员", async () => {
  const app = buildApp();
  try {
    ensureInitialAdmin(env.adminPassword, { reset: true });
    const admins = (await app.inject({ url: "/api/v1/users", headers: { cookie: (await login(app, "owner", env.adminPassword)).cookie } })).json().data.items;
    const adminCookie = (await login(app, admins[0].username, env.adminPassword)).cookie;
    const created = await app.inject({ method: "POST", url: "/api/v1/users", headers: { cookie: adminCookie }, payload: { username: "guest", password: "guest-pass", role: "viewer" } });
    assert.equal(created.statusCode, 200);
    const guestId = created.json().data.id;
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/users", headers: { cookie: adminCookie }, payload: { username: "GUEST", password: "x" } })).statusCode, 409);

    const viewer = await login(app, "guest", "guest-pass");
    assert.equal(viewer.status, 200);
    assert.equal((await app.inject({ url: "/api/v1/albums", headers: { cookie: viewer.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/v1/users", headers: { cookie: viewer.cookie } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/scan", headers: { cookie: viewer.cookie }, payload: {} })).statusCode, 403);
    assert.equal((await app.inject({ method: "PATCH", url: "/api/v1/account", headers: { cookie: viewer.cookie }, payload: { currentPassword: "guest-pass", newPassword: "guest-2" } })).statusCode, 200);

    const disabled = await app.inject({ method: "PATCH", url: `/api/v1/users/${guestId}`, headers: { cookie: adminCookie }, payload: { disabled: true } });
    assert.equal(disabled.statusCode, 200);
    assert.equal((await app.inject({ url: "/api/v1/albums", headers: { cookie: viewer.cookie } })).statusCode, 401);
    assert.equal((await login(app, "guest", "guest-2")).status, 401);

    const selfDemote = await app.inject({ method: "PATCH", url: `/api/v1/users/${admins[0].id}`, headers: { cookie: adminCookie }, payload: { role: "viewer" } });
    assert.equal(selfDemote.statusCode, 409);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/users/${admins[0].id}`, headers: { cookie: adminCookie } })).statusCode, 409);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/users/${guestId}`, headers: { cookie: adminCookie } })).statusCode, 200);
  } finally { await app.close(); }
});
