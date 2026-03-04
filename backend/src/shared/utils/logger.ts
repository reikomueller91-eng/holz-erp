export const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.log,
  fatal: console.error,
  trace: console.trace,
  child: () => logger
} as any;
