import { LOG_LEVELS, resolveLogLevel, type LogLevel } from "../config/log-level.js";

const writeLog = (level: LogLevel, moduleName: string, message: string, detail?: unknown): void => {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(resolveLogLevel(process.env.LOG_LEVEL))) return;
  const prefix = `[${new Date().toISOString()}] [${moduleName}] [${level.toUpperCase()}] ${message}`;
  const output = level === "error" || level === "fatal" ? console.error : level === "warn" ? console.warn : console.log;
  if (detail === undefined) output(prefix); else output(prefix, detail);
};

export const createLogger = (moduleName: string) => ({
  trace: (message: string, detail?: unknown): void => writeLog("trace", moduleName, message, detail),
  debug: (message: string, detail?: unknown): void => writeLog("debug", moduleName, message, detail),
  info: (message: string, detail?: unknown): void => writeLog("info", moduleName, message, detail),
  warn: (message: string, detail?: unknown): void => writeLog("warn", moduleName, message, detail),
  error: (message: string, detail?: unknown): void => writeLog("error", moduleName, message, detail),
  fatal: (message: string, detail?: unknown): void => writeLog("fatal", moduleName, message, detail)
});
