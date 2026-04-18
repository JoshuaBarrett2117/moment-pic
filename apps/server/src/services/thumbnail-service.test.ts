import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ensureThumbnail } from "./thumbnail-service.js";

test("ensureThumbnail handles JPEGs with libvips warnings", async () => {
  const assetId = "ast_68c58721b729f0c1fb1fe05c2059e3f2";
  const thumbnail = await ensureThumbnail(assetId);

  assert.equal(thumbnail.mimeType, "image/jpeg");
  await fs.promises.access(thumbnail.filePath, fs.constants.F_OK);
});
