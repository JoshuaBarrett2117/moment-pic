type LogLevel = "INFO" | "WARN" | "ERROR";

const writeLog = (level: LogLevel, moduleName: string, message: string, detail?: unknown): void => {
  const prefix = `[${new Date().toISOString()}] [${moduleName}] [${level}] ${message}`;
  if (detail === undefined) {
    console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](prefix);
    return;
  }

  console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](prefix, detail);
};

export const createLogger = (moduleName: string) => ({
  warn: (message: string, detail?: unknown): void => writeLog("WARN", moduleName, message, detail),
  info: (message: string, detail?: unknown): void => writeLog("INFO", moduleName, message, detail),
  error: (message: string, detail?: unknown): void => writeLog("ERROR", moduleName, message, detail)
});
