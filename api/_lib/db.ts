import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres'

// Reused across warm serverless invocations so we don't open a fresh
// connection (against Neon's pooled endpoint) on every request.
const globalForSql = globalThis as unknown as { __neonSql?: ReturnType<typeof postgres> }

export const sql =
  globalForSql.__neonSql ??
  postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 4,
    onnotice: () => {},
  })

if (!globalForSql.__neonSql) {
  globalForSql.__neonSql = sql
}
