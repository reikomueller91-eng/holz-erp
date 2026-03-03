export const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.log,
  child: () => logger
} as any;
