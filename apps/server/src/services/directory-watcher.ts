import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";

import { listExistingLibraryRoots } from "./library-scanner.js";
import { scanLibrary } from "./library-scanner.js";
import { nowIso } from "../lib/time.js";
import { wsService } from "./websocket-service.js";
import { getSystemConfigDb } from "./sqlite-store.js";

type WatchEventType = "add" | "change" | "unlink";

type FileChangeEvent = {
  type: WatchEventType;
  path: string;
  libraryRootId: string;
  timestamp: string;
};

type WatchCallback = (event: FileChangeEvent) => void;

class DirectoryWatcherService {
  private watchers: Map<string, FSWatcher> = new Map();
  private callbacks: Set<WatchCallback> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 2000;

  async startWatching(libraryRootId?: string): Promise<void> {
    const roots = listExistingLibraryRoots();
    const targetRoots = libraryRootId
      ? roots.filter((r) => r.id === libraryRootId)
      : roots.filter((r) => r.enabled);

    const config = getSystemConfigDb();
    const usePolling = config.enablePolling;
    const pollingInterval = config.pollingInterval;

    for (const root of targetRoots) {
      if (this.watchers.has(root.id)) {
        continue;
      }

      const watcherOptions: {
        usePolling?: boolean;
        interval?: number;
        binaryInterval?: number;
        ignored?: RegExp;
        persistent?: boolean;
        ignoreInitial?: boolean;
        depth?: number;
        awaitWriteFinish?: {
          stabilityThreshold?: number;
          pollInterval?: number;
        };
      } = {
        usePolling,
        interval: pollingInterval,
        binaryInterval: pollingInterval,
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        depth: 99,
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100
        }
      };

      const watcher = chokidar.watch(root.path, watcherOptions);

      watcher
        .on("add", (filePath) => this.handleFileEvent("add", filePath, root.id, root.path))
        .on("change", (filePath) => this.handleFileEvent("change", filePath, root.id, root.path))
        .on("unlink", (filePath) => this.handleFileEvent("unlink", filePath, root.id, root.path))
        .on("addDir", (dirPath) => this.handleFileEvent("add", dirPath, root.id, root.path))
        .on("unlinkDir", (dirPath) => this.handleFileEvent("unlink", dirPath, root.id, root.path));

      this.watchers.set(root.id, watcher);
    }
  }

  private handleFileEvent(type: WatchEventType, filePath: string, libraryRootId: string, rootPath: string): void {
    const key = `${libraryRootId}:${filePath}`;

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.triggerIncrementalScan(libraryRootId);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);

    const event: FileChangeEvent = {
      type,
      path: filePath,
      libraryRootId,
      timestamp: nowIso()
    };

    this.callbacks.forEach((cb) => cb(event));
    wsService.sendFileChange(event);
  }

  private async triggerIncrementalScan(libraryRootId: string): Promise<void> {
    try {
      const result = await scanLibrary({ libraryRootId });
      const event: FileChangeEvent = {
        type: "change",
        path: "",
        libraryRootId,
        timestamp: nowIso()
      };
      this.callbacks.forEach((cb) => cb(event));
      wsService.sendScanComplete({
        libraryRootId,
        albumsDiscovered: result.albumsDiscovered,
        assetsDiscovered: result.assetsDiscovered,
        timestamp: nowIso()
      });
    } catch (error) {
      console.error(`[DirectoryWatcher] Incremental scan failed for ${libraryRootId}:`, error);
    }
  }

  stopWatching(libraryRootId?: string): void {
    if (libraryRootId) {
      const watcher = this.watchers.get(libraryRootId);
      if (watcher) {
        watcher.close();
        this.watchers.delete(libraryRootId);
      }
      return;
    }

    for (const [id, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  async restartWatching(): Promise<void> {
    this.stopWatching();
    await this.startWatching();
  }

  onFileChange(callback: WatchCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  getWatchedPaths(): string[] {
    const roots = listExistingLibraryRoots();
    return roots
      .filter((r) => this.watchers.has(r.id))
      .map((r) => r.path);
  }

  isWatching(libraryRootId: string): boolean {
    return this.watchers.has(libraryRootId);
  }
}

export const directoryWatcher = new DirectoryWatcherService();
