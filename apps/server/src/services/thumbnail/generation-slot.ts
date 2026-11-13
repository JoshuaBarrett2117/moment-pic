import os from "node:os";

import { WorkBudget } from "../../lib/work-budget.js";

const resolveConcurrency = () => {
  const configured = Number.parseInt(process.env.THUMBNAIL_CONCURRENCY ?? "", 10);
  if (Number.isInteger(configured) && configured >= 1) return Math.min(configured, 16);
  return Math.max(1, Math.min(2, os.availableParallelism()));
};

/** 缩略图/预览生成并发。默认 min(2, CPU 核数)，可用 THUMBNAIL_CONCURRENCY 覆盖（1–16）；每个任务内 sharp 仍单线程。 */
export const GENERATION_CONCURRENCY = resolveConcurrency();
const generationBudget = new WorkBudget(GENERATION_CONCURRENCY, 64);
export const withGenerationSlot = async <Result>(operation: () => Promise<Result>, signal?: AbortSignal): Promise<Result> =>
  generationBudget.run(operation, signal);
