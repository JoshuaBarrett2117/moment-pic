export const RAR_CHUNK_BYTES = 64 * 1024;
export const RAR_WORKER_CHANNEL = "momentpic.archive.rar.worker";

export type RarWorkerRequest = {
  archivePath: string;
  entryPath?: string;
  maxBytes: number;
  maxEntries: number;
  maxListingBytes: number;
  control: SharedArrayBuffer;
};

export type RarWorkerMessage =
  | { type: "chunk"; data: Uint8Array }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };
