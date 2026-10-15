import { readdir } from "node:fs/promises";
import path from "node:path";

export const discoverTests = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(target);
    return /\.test\.tsx?$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat().sort();
};
