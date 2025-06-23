/**
 * Structured logger. JSON in production, pretty output in development.
 * Use `logger.info({ userId, route }, 'message')` pattern.
 */
import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  base: { service: 'autoapply' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.apiKey',
      '*.api_key',
      '*.secret',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    remove: true,
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
})

export type Logger = typeof logger
