import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import path from 'node:path'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin workspace root: a stray package.json in ~/ (from a global fallow install)
  // makes Next.js infer /Users/claw as the root and break module resolution.
  turbopack: { root: path.resolve(__dirname) },
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
