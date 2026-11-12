/**
 * 扫描协调器：进程内所有会写图集索引的扫描（启动扫描、手动扫描、watcher 增量扫描、单图集重扫）
 * 都经这里串行执行，同一时刻只有一个扫描在写库，避免两个扫描把同一新目录各自当成新图集插入
 * （`UNIQUE constraint failed: albums.source_path`）。
 *
 * 只做互斥与排队，不关心扫描内容；“同范围请求合并”由手动扫描任务服务在其上实现。
 */
export class ScanCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private running: string | null = null;
  private queued = 0;

  /** 按提交顺序串行执行；前一个任务失败不影响后续任务。 */
  runExclusive<T>(label: string, task: () => Promise<T>): Promise<T> {
    this.queued += 1;
    const result = this.tail.then(async () => {
      this.queued -= 1;
      this.running = label;
      try {
        return await task();
      } finally {
        this.running = null;
      }
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  /** 当前是否有扫描在执行或排队。 */
  isBusy(): boolean {
    return this.running !== null || this.queued > 0;
  }

  /** 当前执行中的扫描标签（调试/健康检查用）。 */
  currentLabel(): string | null {
    return this.running;
  }

  /** 等待此刻之前提交的全部扫描结束（优雅关闭用）。 */
  async drain(): Promise<void> {
    await this.tail;
  }
}

export const scanCoordinator = new ScanCoordinator();
