import assert from "node:assert/strict";
import test from "node:test";

import { getSystemConfigDb, updateSystemConfigDb } from "./sqlite-store.js";

test("getSystemConfigDb keeps balanced as the default image quality preset", () => {
  const previousConfig = getSystemConfigDb();

  try {
    updateSystemConfigDb({ defaultImageQualityPreset: "balanced" });

    const updatedConfig = getSystemConfigDb();

    assert.equal(updatedConfig.defaultImageQualityPreset, "balanced");
  } finally {
    updateSystemConfigDb({ defaultImageQualityPreset: previousConfig.defaultImageQualityPreset });
  }
});

test("getSystemConfigDb persists page transition mode", () => {
  const previousConfig = getSystemConfigDb();

  try {
    updateSystemConfigDb({ pageTransitionMode: "normal" });

    const updatedConfig = getSystemConfigDb();

    assert.equal(updatedConfig.pageTransitionMode, "normal");
  } finally {
    updateSystemConfigDb({ pageTransitionMode: previousConfig.pageTransitionMode });
  }
});
