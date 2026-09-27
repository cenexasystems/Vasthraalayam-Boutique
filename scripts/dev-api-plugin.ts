import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Serves the Vercel-style serverless functions under api/ from Vite's own
 * dev server, so `npm run dev` works without the Vercel CLI (which needs an
 * account login to run `vercel dev`). Mirrors Vercel's file-based routing —
 * literal segments win over a `[param].ts`/`[param]/` dynamic match — and
 * adapts Node's req/res to the minimal VercelRequest/VercelResponse surface
 * these handlers use (req.query, req.body, res.status().json()).
 */

const API_ROOT = path.resolve(process.cwd(), 'api')

interface ResolvedRoute {
  file: string
  params: Record<string, string>
}

function resolveRoute(dir: string, segments: string[], params: Record<string, string>): ResolvedRoute | null {
  if (segments.length === 0) {
    const indexFile = path.join(dir, 'index.ts')
    return existsSync(indexFile) ? { file: indexFile, params } : null
  }

  const [first, ...rest] = segments

  if (rest.length === 0) {
    const literalFile = path.join(dir, `${first}.ts`)
    if (existsSync(literalFile) && statSync(literalFile).isFile()) {
      return { file: literalFile, params }
    }
  }

  const literalDir = path.join(dir, first)
  if (existsSync(literalDir) && statSync(literalDir).isDirectory()) {
    const match = resolveRoute(literalDir, rest, params)
    if (match) return match
  }

  const entries = readdirSync(dir, { withFileTypes: true })

  if (rest.length === 0) {
    const dynamicFile = entries.find((e) => e.isFile() && /^\[.+\]\.ts$/.test(e.name))
    if (dynamicFile) {
      const paramName = /^\[(.+)\]\.ts$/.exec(dynamicFile.name)![1]
      return { file: path.join(dir, dynamicFile.name), params: { ...params, [paramName]: first } }
    }
  }

  const dynamicDir = entries.find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name))
  if (dynamicDir) {
    const paramName = /^\[(.+)\]$/.exec(dynamicDir.name)![1]
    const match = resolveRoute(path.join(dir, dynamicDir.name), rest, { ...params, [paramName]: first })
    if (match) return match
  }

  return null
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

export function neonApiDevPlugin(): Plugin {
  return {
    name: 'neon-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const segments = url.pathname.split('/').filter(Boolean)
        const route = resolveRoute(API_ROOT, segments, {})
        if (!route) {
          next()
          return
        }

        try {
          const query: Record<string, string> = { ...route.params }
          for (const [key, value] of url.searchParams) query[key] = value

          let body: unknown
          if (req.method && !['GET', 'HEAD'].includes(req.method)) {
            try {
              body = await readJsonBody(req)
            } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              return
            }
          }

          const vercelRes = res as ServerResponse & {
            status: (code: number) => typeof vercelRes
            json: (payload: unknown) => typeof vercelRes
          }
          vercelRes.status = (code: number) => {
            res.statusCode = code
            return vercelRes
          }
          vercelRes.json = (payload: unknown) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return vercelRes
          }

          const vercelReq = req as IncomingMessage & { query: Record<string, string>; body: unknown }
          vercelReq.query = query
          vercelReq.body = body

          const relId = '/' + path.relative(process.cwd(), route.file).split(path.sep).join('/')
          const mod = (await server.ssrLoadModule(relId)) as { default: (req: unknown, res: unknown) => Promise<void> | void }
          await mod.default(vercelReq, vercelRes)
        } catch (err) {
          console.error('[dev-api]', req.url, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal server error' }))
          }
        }
      })
    },
  }
}
