import { rebuildSmartAlbums } from "../smart-album-service.js";

export const runPostLibraryScanTasks = async (): Promise<void> => {
  await rebuildSmartAlbums();
};
