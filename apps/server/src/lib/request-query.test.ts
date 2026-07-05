import assert from "node:assert/strict";
import test from "node:test";

import { parseBoundedInteger, parseEnumValue, parseOptionalString } from "./request-query.js";

test("parseBoundedInteger clamps invalid and out-of-range numbers", () => {
  assert.equal(parseBoundedInteger(undefined, { defaultValue: 24, min: 1, max: 100 }), 24);
  assert.equal(parseBoundedInteger("0", { defaultValue: 24, min: 1, max: 100 }), 1);
  assert.equal(parseBoundedInteger("120", { defaultValue: 24, min: 1, max: 100 }), 100);
  assert.equal(parseBoundedInteger("12.8", { defaultValue: 24, min: 1, max: 100 }), 12);
});

test("parseEnumValue and parseOptionalString normalize route query values", () => {
  assert.equal(parseEnumValue("zip", ["folder", "zip"] as const), "zip");
  assert.equal(parseEnumValue("rar", ["folder", "zip"] as const), undefined);
  assert.equal(parseOptionalString("  "), undefined);
  assert.equal(parseOptionalString("keyword"), "keyword");
});
