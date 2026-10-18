export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export const resolveLogLevel = (value: string | undefined): LogLevel => LOG_LEVELS.includes(value as LogLevel) ? value as LogLevel : "info";
