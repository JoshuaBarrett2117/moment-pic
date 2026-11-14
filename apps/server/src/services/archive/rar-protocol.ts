export const RAR_CHUNK_BYTES = 64 * 1024;
export const RAR_WORKER_CHANNEL = "momentpic.archive.rar.worker";

export type RarWorkerRequest = {
  archivePath: string;
  entryPath?: string;
  /** 整包顺序解压：所有文件内容按归档顺序拼接输出（供解压缓存切分）。 */
  extractAll?: boolean;
  maxBytes: number;
  maxEntries: number;
  maxListingBytes: number;
  control: SharedArrayBuffer;
};

export type RarWorkerMessage =
  | { type: "chunk"; data: Uint8Array }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };
