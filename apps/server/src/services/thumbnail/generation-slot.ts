import { WorkBudget } from "../../lib/work-budget.js";

const generationBudget = new WorkBudget(1, 64);
export const withGenerationSlot = async <Result>(operation: () => Promise<Result>, signal?: AbortSignal): Promise<Result> =>
  generationBudget.run(operation, signal);
