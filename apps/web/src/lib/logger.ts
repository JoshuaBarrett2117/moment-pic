type LogLevel = 'INFO' | 'ERROR';

const writeLog = (level: LogLevel, moduleName: string, message: string, detail?: unknown): void => {
  const prefix = `[${new Date().toISOString()}] [${moduleName}] [${level}] ${message}`;
  if (detail === undefined) {
    console[level === 'ERROR' ? 'error' : 'log'](prefix);
    return;
  }

  console[level === 'ERROR' ? 'error' : 'log'](prefix, detail);
};

export const createLogger = (moduleName: string) => ({
  info: (message: string, detail?: unknown): void => writeLog('INFO', moduleName, message, detail),
  error: (message: string, detail?: unknown): void => writeLog('ERROR', moduleName, message, detail),
});
