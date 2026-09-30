import postgres from 'postgres'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

function getDatabaseUrl(): string {
  try {
    const envPath = path.resolve(process.cwd(), '.env')
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8')
      const match = content.match(/^DATABASE_URL\s*=\s*(.+)$/m)
      if (match) {
        let val = match[1].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        process.env.DATABASE_URL = val
        return val
      }
    }
  } catch {}
  return process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres'
}

const globalForSql = globalThis as unknown as {
  __neonSql?: ReturnType<typeof postgres>
  __neonSqlUrl?: string
}

function getSql(): ReturnType<typeof postgres> {
  const currentUrl = getDatabaseUrl()
  if (globalForSql.__neonSql && globalForSql.__neonSqlUrl === currentUrl) {
    return globalForSql.__neonSql
  }
  if (globalForSql.__neonSql && globalForSql.__neonSqlUrl !== currentUrl) {
    globalForSql.__neonSql.end().catch(() => {})
  }
  const instance = postgres(currentUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 4,
    onnotice: () => {},
  })
  globalForSql.__neonSql = instance
  globalForSql.__neonSqlUrl = currentUrl
  return instance
}

export const sql = new Proxy((() => {}) as unknown as ReturnType<typeof postgres>, {
  get(_target, prop) {
    const instance = getSql() as any
    const val = instance[prop]
    return typeof val === 'function' ? val.bind(instance) : val
  },
  apply(_target, _thisArg, args) {
    const instance = getSql() as any
    return instance(...args)
  },
})

