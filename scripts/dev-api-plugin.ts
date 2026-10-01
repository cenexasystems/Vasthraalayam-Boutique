import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Serves the Vercel-style serverless functions under api/ from Vite's own
 * dev server, so `npm run dev` works without the Vercel CLI.
 * Supports Vercel rewrites (e.g. /api/auth/login -> /api/auth).
 */

const API_ROOT = path.resolve(process.cwd(), 'api')

interface ResolvedRoute {
  file: string
  params: Record<string, string>
}

function applyVercelRewrites(pathname: string): { rewrittenPath: string; extraParams: Record<string, string> } {
  const extraParams: Record<string, string> = {}

  if (pathname === '/auth/login' || pathname === '/api/auth/login') {
    return { rewrittenPath: '/auth', extraParams }
  }
  if (pathname === '/inventory/adjust') {
    extraParams.action = 'adjust'
    return { rewrittenPath: '/inventory', extraParams }
  }
  if (pathname === '/inventory/receive') {
    extraParams.action = 'receive'
    return { rewrittenPath: '/inventory', extraParams }
  }
  if (pathname === '/inventory-movements') {
    extraParams.resource = 'movements'
    return { rewrittenPath: '/inventory', extraParams }
  }
  if (pathname === '/order-items') {
    extraParams.resource = 'items'
    return { rewrittenPath: '/orders', extraParams }
  }
  if (pathname === '/settings/password') {
    extraParams.action = 'password'
    return { rewrittenPath: '/settings', extraParams }
  }
  if (pathname === '/printer-profiles' || pathname === '/api/printer-profiles') {
    extraParams.resource = 'profiles'
    return { rewrittenPath: '/custom-label-sizes', extraParams }
  }

  const profileMatch = pathname.match(/^\/(?:api\/)?printer-profiles\/([^/]+)$/)
  if (profileMatch) {
    extraParams.resource = 'profiles'
    extraParams.id = decodeURIComponent(profileMatch[1])
    return { rewrittenPath: '/custom-label-sizes', extraParams }
  }

  const advanceMatch = pathname.match(/^\/advance-orders\/([^/]+)$/)
  if (advanceMatch) {
    extraParams.id = decodeURIComponent(advanceMatch[1])
    return { rewrittenPath: '/advance-orders', extraParams }
  }

  const lookupMatch = pathname.match(/^\/barcode-registry\/lookup\/([^/]+)$/)
  if (lookupMatch) {
    extraParams.action = 'lookup'
    extraParams.code = decodeURIComponent(lookupMatch[1])
    return { rewrittenPath: '/barcode-registry', extraParams }
  }

  const barcodeIdMatch = pathname.match(/^\/barcode-registry\/([^/]+)$/)
  if (barcodeIdMatch) {
    extraParams.id = decodeURIComponent(barcodeIdMatch[1])
    return { rewrittenPath: '/barcode-registry', extraParams }
  }

  const catMatch = pathname.match(/^\/categories\/([^/]+)$/)
  if (catMatch) {
    extraParams.id = decodeURIComponent(catMatch[1])
    return { rewrittenPath: '/categories', extraParams }
  }

  const couponIdMatch = pathname.match(/^\/coupons\/id\/([^/]+)$/)
  if (couponIdMatch) {
    extraParams.id = decodeURIComponent(couponIdMatch[1])
    return { rewrittenPath: '/coupons', extraParams }
  }

  const couponCodeMatch = pathname.match(/^\/coupons\/([^/]+)$/)
  if (couponCodeMatch) {
    extraParams.code = decodeURIComponent(couponCodeMatch[1])
    return { rewrittenPath: '/coupons', extraParams }
  }

  const orderMatch = pathname.match(/^\/orders\/([^/]+)$/)
  if (orderMatch) {
    extraParams.id = decodeURIComponent(orderMatch[1])
    return { rewrittenPath: '/orders', extraParams }
  }

  const prodMatch = pathname.match(/^\/products\/([^/]+)$/)
  if (prodMatch) {
    extraParams.id = decodeURIComponent(prodMatch[1])
    return { rewrittenPath: '/products', extraParams }
  }

  const variantMatch = pathname.match(/^\/variants\/([^/]+)$/)
  if (variantMatch) {
    extraParams.id = decodeURIComponent(variantMatch[1])
    return { rewrittenPath: '/variants', extraParams }
  }

  return { rewrittenPath: pathname, extraParams }
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
        const { rewrittenPath, extraParams } = applyVercelRewrites(url.pathname)
        const segments = rewrittenPath.split('/').filter(Boolean)
        const route = resolveRoute(API_ROOT, segments, {})
        if (!route) {
          next()
          return
        }

        try {
          const query: Record<string, string> = { ...route.params, ...extraParams }
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
