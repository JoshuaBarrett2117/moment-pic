import fs from "node:fs";
import path from "node:path";

import { env } from "../config/env.js";
import type { IndexStore } from "../types/store.js";

const emptyStore = (): IndexStore => ({
  libraryRoots: [],
  albums: [],
  assets: [],
  thumbnails: []
});

export const ensureDataDir = async () => {
  await fs.promises.mkdir(path.dirname(env.indexFilePath), { recursive: true });
};

export const readStore = async (): Promise<IndexStore> => {
  await ensureDataDir();

  try {
    const content = await fs.promises.readFile(env.indexFilePath, "utf8");
    return JSON.parse(content) as IndexStore;
  } catch {
    const store = emptyStore();
    await writeStore(store);
    return store;
  }
};

export const writeStore = async (store: IndexStore) => {
  await ensureDataDir();
  await fs.promises.writeFile(env.indexFilePath, JSON.stringify(store, null, 2), "utf8");
};
