import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

export const logger = pino(
  isDev
    ? {
        level: process.env['LOG_LEVEL'] ?? 'info',
        transport: { target: 'pino-pretty', options: { colorize: true } },
        redact: {
          paths: ['req.headers.authorization', 'masterPassword', 'password'],
          censor: '[REDACTED]',
        },
      }
    : {
        level: process.env['LOG_LEVEL'] ?? 'info',
        redact: {
          paths: ['req.headers.authorization', 'masterPassword', 'password'],
          censor: '[REDACTED]',
        },
      },
);
