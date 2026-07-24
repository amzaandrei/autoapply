import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit tests for server/lib logic only — no jsdom, no live Redis/Postgres.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Force the in-memory rate-limit path and keep imports hermetic regardless
    // of the surrounding shell environment.
    env: {
      REDIS_URL: '',
    },
  },
  resolve: {
    // Mirror tsconfig `paths` ("@/*" -> "./*") so tests can import via "@/lib/...".
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
