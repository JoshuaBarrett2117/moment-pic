import fs from "node:fs";
import { createLogger } from "../lib/logger.js";
import { probeDatabaseDb } from "../repositories/health-repository.js";
import { scanCoordinator } from "./scan-coordinator.js";

const logger = createLogger("Health");
const version = (() => {
  try { return String((JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string }).version ?? "unknown"); }
  catch { return "unknown"; }
})();

export type HealthScanState = { busy: boolean; label: string | null };

export const getHealth = (
  probe: () => void = probeDatabaseDb,
  scanState: () => HealthScanState = () => ({ busy: scanCoordinator.isBusy(), label: scanCoordinator.currentLabel() })
): { status: "ok" | "error"; db: "ok" | "error"; dbLatencyMs: number; uptime: number; version: string; scan: HealthScanState } => {
  const started = process.hrtime.bigint();
  let status: "ok" | "error" = "ok";
  try { probe(); }
  catch (error) { status = "error"; logger.error("数据库健康探测失败", error); }
  const dbLatencyMs = Number(process.hrtime.bigint() - started) / 1e6;
  // better-sqlite3 同步调用不可被 JS 定时器抢占；锁等待由 busy_timeout=2000 限制。
  if (dbLatencyMs > 2000) logger.warn("数据库探测超过 2 秒，记录实际时延", { dbLatencyMs });
  // 扫描进行中不影响健康状态，只附带进度，便于首次部署时观察。
  return { status, db: status, dbLatencyMs, uptime: process.uptime(), version, scan: scanState() };
};
