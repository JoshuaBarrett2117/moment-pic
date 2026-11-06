import assert from "node:assert/strict";
import test from "node:test";

import { getDb } from "../db/sqlite.js";
import { getSmartAlbumAiConfigDb, updateSmartAlbumAiConfigDb } from "../repositories/smart-album-repository.js";
import { validateAiEndpoint } from "./ai-endpoint.js";
import { isSealed, openSecret, sealSecret } from "./secret-box.js";

test("AI token 加密落库，读取时解密；兼容历史明文", () => {
  const sealed = sealSecret("sk-test-123");
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.includes("sk-test-123"));
  assert.equal(openSecret(sealed), "sk-test-123");
  assert.equal(openSecret("legacy-plain"), "legacy-plain");
  assert.equal(openSecret(`${sealed.slice(0, -2)}xx`), null);

  const { createdAt: _c, updatedAt: _u, ...current } = getSmartAlbumAiConfigDb();
  updateSmartAlbumAiConfigDb({ ...current, apiToken: "sk-secret-value" });
  const raw = (getDb().prepare("SELECT api_token FROM smart_album_ai_configs").get() as { api_token: string }).api_token;
  assert.ok(isSealed(raw));
  assert.equal(getSmartAlbumAiConfigDb().apiToken, "sk-secret-value");
});

test("AI 接口地址：公网必须 https，局域网可 http，拒绝内嵌账号与非 http 协议", () => {
  assert.equal(validateAiEndpoint("https://api.openai.com/v1"), "https://api.openai.com/v1");
  assert.equal(validateAiEndpoint("http://192.168.1.10:11434/v1"), "http://192.168.1.10:11434/v1");
  assert.equal(validateAiEndpoint("http://localhost:11434/v1"), "http://localhost:11434/v1");
  for (const bad of ["http://api.example.com/v1", "file:///etc/passwd", "https://user:pass@api.example.com", "not a url"]) {
    assert.throws(() => validateAiEndpoint(bad));
  }
});
