import { config as loadEnv } from 'dotenv'

// Prisma 7 CLI doesn't auto-load .env files when a prisma.config.ts is present.
// Load .env.local first (dev default in this repo), then .env as a fallback,
// so `npm run db:push` / `prisma studio` pick up the right DATABASE_URL.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/autoapply',
  },
}

