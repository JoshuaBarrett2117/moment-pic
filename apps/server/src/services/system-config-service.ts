import type { SystemConfigRecord } from "../repositories/system-config-repository.js";
import { getSystemConfigDb, updateSystemConfigDb } from "../repositories/system-config-repository.js";
import { directoryWatcher } from "./directory-watcher.js";

export type SystemConfigUpdateInput = {
  enablePolling?: boolean;
  pollingInterval?: number;
  preloadBefore?: number;
  preloadAfter?: number;
  defaultImageQualityPreset?: "low" | "balanced" | "high" | "original";
  pageTransitionMode?: "page" | "normal";
  albumListItemMinWidthMobile?: number;
  albumListItemMinWidthDesktop?: number;
  albumDetailItemMinWidthMobile?: number;
  albumDetailItemMinWidthDesktop?: number;
};

export const getSystemConfig = async (): Promise<SystemConfigRecord> => getSystemConfigDb();

export const updateSystemConfig = async (input: SystemConfigUpdateInput): Promise<SystemConfigRecord> => {
  const result = updateSystemConfigDb(input);
  await directoryWatcher.restartWatching();
  return result;
};
