import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app.js";

test("API、未鉴权 401 与静态页均返回安全响应头，且不强制 HTTPS", async () => {
  const app = buildApp();
  try {
    for (const url of ["/api/v1/health", "/api/v1/albums"]) {
      const response = await app.inject(url);
      assert.equal(response.headers["x-content-type-options"], "nosniff");
      assert.equal(response.headers["x-frame-options"], "DENY");
      assert.equal(response.headers["referrer-policy"], "no-referrer");
      const csp = String(response.headers["content-security-policy"]);
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.doesNotMatch(csp, /upgrade-insecure-requests/);
      assert.equal(response.headers["strict-transport-security"], undefined);
    }
  } finally { await app.close(); }
});
