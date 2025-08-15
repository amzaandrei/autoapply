// Prisma 7 CLI doesn't auto-load .env files when a prisma.config.ts is present,
// so dev commands (npm run db:push, prisma studio) need us to pull DATABASE_URL
// out of .env.local / .env manually. In the prod container, DATABASE_URL is
// already in process.env (set by docker-compose), dotenv isn't reachable from
// /app (node_modules lives under /app/worker_modules), and the .env files
// don't exist — so the require is wrapped in try/catch and skipped if either
// prerequisite is absent.
if (!process.env.DATABASE_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config: loadEnv } = require('dotenv') as typeof import('dotenv')
    loadEnv({ path: '.env.local' })
    loadEnv({ path: '.env' })
  } catch {
    // dotenv unavailable in minimal runtime image — fine, env is already populated
  }
}

export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/autoapply',
  },
}

