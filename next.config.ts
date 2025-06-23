import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Force Node-only packages to stay on the server — prevents the bundler
  // from trying to pull pg/fs/net/tls/dns into a client chunk if any client
  // component accidentally imports server-only code via a transitive path.
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'prisma',
    'pg',
    'pg-connection-string',
    'pgpass',
    'bullmq',
    'ioredis',
    'googleapis',
    '@sentry/nextjs',
    'posthog-node',
    'pino',
    'pino-pretty',
  ],
  experimental: {
    // Reduce compile memory for large Docker builds.
    webpackBuildWorker: true,
  },
  // Allow Sentry build-time auth via env (SENTRY_AUTH_TOKEN). No-op if unset.
}

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig
