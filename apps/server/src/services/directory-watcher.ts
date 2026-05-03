import chokidar, { FSWatcher } from "chokidar";

import { listExistingLibraryRoots } from "./library-scanner.js";
import { scanLibrary } from "./library-scanner.js";
import { nowIso } from "../lib/time.js";
import { wsService } from "./websocket-service.js";
import { getSystemConfigDb } from "../repositories/system-config-repository.js";

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
  private debounceTimersByRoot: Map<string, NodeJS.Timeout> = new Map();
  private incrementalScanStates: Map<string, { running: boolean; pending: boolean }> = new Map();
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
        .on("add", (filePath) => this.handleFileEvent("add", filePath, root.id))
        .on("change", (filePath) => this.handleFileEvent("change", filePath, root.id))
        .on("unlink", (filePath) => this.handleFileEvent("unlink", filePath, root.id))
        .on("addDir", (dirPath) => this.handleFileEvent("add", dirPath, root.id))
        .on("unlinkDir", (dirPath) => this.handleFileEvent("unlink", dirPath, root.id));

      this.watchers.set(root.id, watcher);
    }
  }

  private handleFileEvent(type: WatchEventType, filePath: string, libraryRootId: string): void {
    const existingTimer = this.debounceTimersByRoot.get(libraryRootId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimersByRoot.delete(libraryRootId);
      this.queueIncrementalScan(libraryRootId);
    }, this.DEBOUNCE_MS);

    this.debounceTimersByRoot.set(libraryRootId, timer);

    const event: FileChangeEvent = {
      type,
      path: filePath,
      libraryRootId,
      timestamp: nowIso()
    };

    this.callbacks.forEach((cb) => cb(event));
    wsService.sendFileChange(event);
  }

  private queueIncrementalScan(libraryRootId: string): void {
    const state = this.incrementalScanStates.get(libraryRootId) ?? {
      running: false,
      pending: false
    };

    if (state.running) {
      state.pending = true;
      this.incrementalScanStates.set(libraryRootId, state);
      return;
    }

    this.incrementalScanStates.set(libraryRootId, {
      running: true,
      pending: false
    });
    void this.runIncrementalScan(libraryRootId);
  }

  private async runIncrementalScan(libraryRootId: string): Promise<void> {
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
    } finally {
      const state = this.incrementalScanStates.get(libraryRootId);
      if (!state) {
        return;
      }

      if (state.pending) {
        this.incrementalScanStates.set(libraryRootId, {
          running: true,
          pending: false
        });
        void this.runIncrementalScan(libraryRootId);
        return;
      }

      this.incrementalScanStates.set(libraryRootId, {
        running: false,
        pending: false
      });
    }
  }

  stopWatching(libraryRootId?: string): void {
    if (libraryRootId) {
      const watcher = this.watchers.get(libraryRootId);
      if (watcher) {
        watcher.close();
        this.watchers.delete(libraryRootId);
      }
      const timer = this.debounceTimersByRoot.get(libraryRootId);
      if (timer) {
        clearTimeout(timer);
      }
      this.debounceTimersByRoot.delete(libraryRootId);
      this.incrementalScanStates.delete(libraryRootId);
      return;
    }

    for (const [id, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    for (const timer of this.debounceTimersByRoot.values()) {
      clearTimeout(timer);
    }
    this.debounceTimersByRoot.clear();
    this.incrementalScanStates.clear();
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
