import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

async function get(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res, ['admin'])
  if (!session) return

  const id = Number(req.query.id)
  if (!id || isNaN(id)) {
    // List recent backups
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const businessId = String(req.query.business_id || '1').trim()
    const rows = await sql`
      SELECT id, business_id, entity_type, entity_id, entity_identifier, deleted_by, deleted_at
      FROM public.delete_backups
      WHERE business_id = ${businessId}
      ORDER BY deleted_at DESC
      LIMIT ${limit}
    `
    res.status(200).json({ data: rows })
    return
  }

  const businessId = String(req.query.business_id || '1').trim()
  const rows = await sql`
    SELECT id, business_id, entity_type, entity_id, entity_identifier, deleted_by, deleted_at, backup_data
    FROM public.delete_backups
    WHERE id = ${id} AND (business_id = ${businessId} OR business_id = '1')
    LIMIT 1
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Backup not found' })
    return
  }

  const backup = rows[0]
  if (req.query.download === 'true') {
    const filename = `backup-${backup.entity_type}-${backup.entity_identifier || backup.entity_id}-${Date.now()}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(JSON.stringify(backup.backup_data, null, 2))
    return
  }

  res.status(200).json({ data: backup })
}

export default methodRouter({ GET: get })
