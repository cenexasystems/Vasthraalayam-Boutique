import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { methodRouter } from './_lib/handler.js'

function getBusinessId(req: VercelRequest): string {
  const queryBiz = req.query.business_id
  if (typeof queryBiz === 'string' && queryBiz.trim()) return queryBiz.trim()
  const headerBiz = req.headers['x-business-id']
  if (typeof headerBiz === 'string' && headerBiz.trim()) return headerBiz.trim()
  if (Array.isArray(headerBiz) && headerBiz[0]?.trim()) return headerBiz[0].trim()
  const bodyBiz = (req.body as Record<string, unknown> | undefined)?.business_id
  if (typeof bodyBiz === 'string' && bodyBiz.trim()) return bodyBiz.trim()
  return '1'
}

function shapeSizeRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    business_id: String(row.business_id || '1'),
    name: String(row.name),
    label: String(row.name),
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    columns: Number(row.columns || 1),
    rows: Number(row.rows || 1),
    gap_mm: Number(row.gap_mm || 0),
    gap_y_mm: Number(row.gap_y_mm || 0),
    margin_top_mm: Number(row.margin_top_mm || 0),
    margin_bottom_mm: Number(row.margin_bottom_mm || 0),
    margin_left_mm: Number(row.margin_left_mm || 0),
    margin_right_mm: Number(row.margin_right_mm || 0),
    use_case: 'Custom Size',
    category: 'Custom Sizes',
    isCustom: true,
    // CamelCase compatibility aliases
    widthMm: Number(row.width_mm),
    heightMm: Number(row.height_mm),
    labelsPerRow: Number(row.columns || 1),
    horizontalGapMm: Number(row.gap_mm || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function shapeProfileRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    business_id: String(row.business_id || '1'),
    name: String(row.name),
    is_default: Boolean(row.is_default),
    printer_type: String(row.printer_type || 'label'),
    size_id: String(row.size_id || '2_38x25'),
    orientation: String(row.orientation || 'portrait'),
    rotation: Number(row.rotation || 0),
    margin_top_mm: Number(row.margin_top_mm || 0),
    margin_right_mm: Number(row.margin_right_mm || 0),
    margin_bottom_mm: Number(row.margin_bottom_mm || 0),
    margin_left_mm: Number(row.margin_left_mm || 0),
    gap_x_mm: Number(row.gap_x_mm ?? 2),
    gap_y_mm: Number(row.gap_y_mm || 0),
    offset_x_mm: Number(row.offset_x_mm || 0),
    offset_y_mm: Number(row.offset_y_mm || 0),
    barcode_type: String(row.barcode_type || 'CODE128'),
    font_scale: Number(row.font_scale || 1.0),
    barcode_height_scale: Number(row.barcode_height_scale || 1.0),
    show_product_name: Boolean(row.show_product_name),
    show_price: Boolean(row.show_price),
    show_sku: Boolean(row.show_sku),
    show_mrp: Boolean(row.show_mrp),
    show_variant: Boolean(row.show_variant),
    show_business_name: Boolean(row.show_business_name),
    show_date: Boolean(row.show_date),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ==================== GET ====================
async function get(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const businessId = getBusinessId(req)
  const isProfile = req.query.resource === 'profiles'

  if (isProfile) {
    let profileRows = await sql`
      SELECT *
      FROM public.printer_profiles
      WHERE business_id = ${businessId}
      ORDER BY is_default DESC, created_at ASC
    `

    // Auto-seed default profile if none exists for this business
    if (profileRows.length === 0) {
      const defaultId = `profile_default_${businessId}`
      await sql`
        INSERT INTO public.printer_profiles (
          id, business_id, name, is_default, printer_type, size_id, orientation, rotation,
          margin_top_mm, margin_right_mm, margin_bottom_mm, margin_left_mm,
          gap_x_mm, gap_y_mm, offset_x_mm, offset_y_mm, barcode_type, font_scale, barcode_height_scale,
          show_product_name, show_price, show_sku, show_mrp, show_variant, show_business_name, show_date,
          sheet_start_position, created_at, updated_at
        ) VALUES (
          ${defaultId}, ${businessId}, 'Standard Thermal 38×25', true, 'label', '2_38x25', 'portrait', 0,
          0, 0, 0, 0,
          2, 0, 0, 0, 'CODE128', 1.0, 1.0,
          true, true, true, false, true, true, false,
          1, NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `
      profileRows = await sql`
        SELECT *
        FROM public.printer_profiles
        WHERE business_id = ${businessId}
        ORDER BY is_default DESC, created_at ASC
      `
    }

    const prefRows = await sql`
      SELECT last_used_profile_id
      FROM public.business_label_settings
      WHERE business_id = ${businessId}
      LIMIT 1
    `

    res.status(200).json({
      data: profileRows.map(shapeProfileRow),
      lastUsedProfileId: (prefRows[0] as { last_used_profile_id?: string } | undefined)?.last_used_profile_id || null,
    })
    return
  }

  // Otherwise, custom label sizes
  const [sizesRows, prefRows] = await Promise.all([
    sql`
      SELECT id, business_id, name, width_mm::float, height_mm::float, columns::int, gap_mm::float, created_at, updated_at
      FROM public.custom_label_sizes
      WHERE business_id = ${businessId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT last_used_size_id
      FROM public.business_label_settings
      WHERE business_id = ${businessId}
      LIMIT 1
    `,
  ])

  res.status(200).json({
    data: sizesRows.map(shapeSizeRow),
    lastUsedSizeId: (prefRows[0] as { last_used_size_id?: string } | undefined)?.last_used_size_id || null,
  })
}

// ==================== POST ====================
async function create(req: VercelRequest, res: VercelResponse) {
  const businessId = getBusinessId(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const isProfile = req.query.resource === 'profiles' || body.resource === 'profiles'

  if (isProfile) {
    const name = String(body.name || '').trim()
    if (!name) {
      res.status(400).json({ error: 'Profile name is required' })
      return
    }

    // Check unique name per business
    const duplicate = await sql`
      SELECT id FROM public.printer_profiles
      WHERE business_id = ${businessId} AND LOWER(TRIM(name)) = LOWER(${name})
      LIMIT 1
    `
    if (duplicate.length > 0) {
      res.status(400).json({ error: 'A profile with this name already exists' })
      return
    }

    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `profile_${Date.now()}`
    const isDefault = Boolean(body.is_default)

    if (isDefault) {
      await sql`
        UPDATE public.printer_profiles
        SET is_default = false
        WHERE business_id = ${businessId}
      `
    }

    const rows = await sql`
      INSERT INTO public.printer_profiles (
        id, business_id, name, is_default, printer_type, size_id, orientation, rotation,
        margin_top_mm, margin_right_mm, margin_bottom_mm, margin_left_mm,
        gap_x_mm, gap_y_mm, offset_x_mm, offset_y_mm, barcode_type, font_scale, barcode_height_scale,
        show_product_name, show_price, show_sku, show_mrp, show_variant, show_business_name, show_date,
        sheet_start_position, created_at, updated_at
      ) VALUES (
        ${id}, ${businessId}, ${name}, ${isDefault},
        ${String(body.printer_type || 'label')},
        ${String(body.size_id || '2_38x25')},
        ${String(body.orientation || 'portrait')},
        ${Number(body.rotation || 0)},
        ${Number(body.margin_top_mm || 0)},
        ${Number(body.margin_right_mm || 0)},
        ${Number(body.margin_bottom_mm || 0)},
        ${Number(body.margin_left_mm || 0)},
        ${Number(body.gap_x_mm ?? 2)},
        ${Number(body.gap_y_mm || 0)},
        ${Number(body.offset_x_mm || 0)},
        ${Number(body.offset_y_mm || 0)},
        ${String(body.barcode_type || 'CODE128')},
        ${Number(body.font_scale || 1.0)},
        ${Number(body.barcode_height_scale || 1.0)},
        ${body.show_product_name !== false},
        ${body.show_price !== false},
        ${body.show_sku !== false},
        ${Boolean(body.show_mrp)},
        ${body.show_variant !== false},
        ${body.show_business_name !== false},
        ${Boolean(body.show_date)},
        ${Number(body.sheet_start_position || 1)},
        NOW(), NOW()
      )
      RETURNING *
    `

    res.status(201).json({ data: shapeProfileRow(rows[0]) })
    return
  }

  // Otherwise, create custom size
  const rawName = String(body.name || body.label || '').trim()
  if (!rawName) {
    res.status(400).json({ error: 'Name is required' })
    return
  }

  const widthMm = Number(body.width_mm ?? body.widthMm)
  const heightMm = Number(body.height_mm ?? body.heightMm)
  const columns = Math.round(Number(body.columns ?? body.labelsPerRow ?? 1))
  const gapMm = Number(body.gap_mm ?? body.horizontalGapMm ?? 0)

  if (isNaN(widthMm) || widthMm < 10 || widthMm > 210) {
    res.status(400).json({ error: 'Width must be between 10 mm and 210 mm' })
    return
  }
  if (isNaN(heightMm) || heightMm < 10 || heightMm > 210) {
    res.status(400).json({ error: 'Height must be between 10 mm and 210 mm' })
    return
  }
  if (isNaN(columns) || columns < 1 || columns > 10) {
    res.status(400).json({ error: 'Columns must be between 1 and 10' })
    return
  }
  if (isNaN(gapMm) || gapMm < 0 || gapMm > 50) {
    res.status(400).json({ error: 'Gap must be between 0 mm and 50 mm' })
    return
  }

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `custom_${Date.now()}`

  const rows = await sql`
    INSERT INTO public.custom_label_sizes (id, business_id, name, width_mm, height_mm, columns, gap_mm, created_at, updated_at)
    VALUES (${id}, ${businessId}, ${rawName}, ${widthMm}, ${heightMm}, ${columns}, ${gapMm}, NOW(), NOW())
    RETURNING id, business_id, name, width_mm::float, height_mm::float, columns::int, gap_mm::float, created_at, updated_at
  `

  res.status(201).json({ data: shapeSizeRow(rows[0]) })
}

// ==================== PUT ====================
async function update(req: VercelRequest, res: VercelResponse) {
  const businessId = getBusinessId(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const isProfile = req.query.resource === 'profiles' || body.resource === 'profiles'

  if (isProfile) {
    // 1) Set last used profile
    if (body.action === 'set_last_used' || body.last_used_profile_id) {
      const profileId = String(body.last_used_profile_id || '').trim()
      if (!profileId) {
        res.status(400).json({ error: 'last_used_profile_id is required' })
        return
      }

      await sql`
        INSERT INTO public.business_label_settings (business_id, last_used_size_id, last_used_profile_id, updated_at)
        VALUES (${businessId}, '2_38x25', ${profileId}, NOW())
        ON CONFLICT (business_id) DO UPDATE
        SET last_used_profile_id = EXCLUDED.last_used_profile_id, updated_at = NOW()
      `

      res.status(200).json({ data: { success: true, last_used_profile_id: profileId } })
      return
    }

    const id = String(body.id || req.query.id || '').trim()
    if (!id) {
      res.status(400).json({ error: 'Profile ID is required' })
      return
    }

    // 2) Set default profile
    if (body.action === 'set_default') {
      await sql`
        UPDATE public.printer_profiles
        SET is_default = false
        WHERE business_id = ${businessId}
      `
      const rows = await sql`
        UPDATE public.printer_profiles
        SET is_default = true, updated_at = NOW()
        WHERE id = ${id} AND business_id = ${businessId}
        RETURNING *
      `
      if (rows.length === 0) {
        res.status(404).json({ error: 'Profile not found' })
        return
      }
      res.status(200).json({ data: shapeProfileRow(rows[0]) })
      return
    }

    // 3) Duplicate profile
    if (body.action === 'duplicate') {
      let original: any = null
      const existing = await sql`
        SELECT * FROM public.printer_profiles
        WHERE id = ${id} AND business_id = ${businessId}
        LIMIT 1
      `
      if (existing.length > 0) {
        original = existing[0]
      } else {
        // Fallback to provided snapshot or default settings
        original = {
          name: String(body.name || 'Standard Thermal 38×25'),
          printer_type: String(body.printer_type || 'label'),
          size_id: String(body.size_id || '2_38x25'),
          orientation: String(body.orientation || 'portrait'),
          rotation: Number(body.rotation || 0),
          margin_top_mm: Number(body.margin_top_mm || 0),
          margin_right_mm: Number(body.margin_right_mm || 0),
          margin_bottom_mm: Number(body.margin_bottom_mm || 0),
          margin_left_mm: Number(body.margin_left_mm || 0),
          gap_x_mm: Number(body.gap_x_mm ?? 2),
          gap_y_mm: Number(body.gap_y_mm || 0),
          offset_x_mm: Number(body.offset_x_mm || 0),
          offset_y_mm: Number(body.offset_y_mm || 0),
          barcode_type: String(body.barcode_type || 'CODE128'),
          font_scale: Number(body.font_scale || 1.0),
          barcode_height_scale: Number(body.barcode_height_scale || 1.0),
          show_product_name: body.show_product_name !== undefined ? Boolean(body.show_product_name) : true,
          show_price: body.show_price !== undefined ? Boolean(body.show_price) : true,
          show_sku: body.show_sku !== undefined ? Boolean(body.show_sku) : true,
          show_mrp: Boolean(body.show_mrp),
          show_variant: body.show_variant !== undefined ? Boolean(body.show_variant) : true,
          show_business_name: body.show_business_name !== undefined ? Boolean(body.show_business_name) : true,
          show_date: Boolean(body.show_date),
          sheet_start_position: Number(body.sheet_start_position || 1),
        }
      }

      // Query all existing profile names for this business to determine unique copy name
      const allProfiles = await sql`
        SELECT name FROM public.printer_profiles WHERE business_id = ${businessId}
      `
      const existingNames = new Set(allProfiles.map((r: Record<string, unknown>) => String(r.name || '').trim().toLowerCase()))

      const baseClean = original.name.replace(/\s*\(Copy(?:\s+\d+)?\)$/i, '').trim()
      let candidate = `${baseClean} (Copy)`
      let counter = 2
      while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${baseClean} (Copy ${counter})`
        counter++
      }

      const newId = `profile_${Date.now()}`
      const rows = await sql`
        INSERT INTO public.printer_profiles (
          id, business_id, name, is_default, printer_type, size_id, orientation, rotation,
          margin_top_mm, margin_right_mm, margin_bottom_mm, margin_left_mm,
          gap_x_mm, gap_y_mm, offset_x_mm, offset_y_mm, barcode_type, font_scale, barcode_height_scale,
          show_product_name, show_price, show_sku, show_mrp, show_variant, show_business_name, show_date,
          sheet_start_position, created_at, updated_at
        ) VALUES (
          ${newId}, ${businessId}, ${candidate}, false,
          ${original.printer_type}, ${original.size_id}, ${original.orientation}, ${original.rotation},
          ${original.margin_top_mm}, ${original.margin_right_mm}, ${original.margin_bottom_mm}, ${original.margin_left_mm},
          ${original.gap_x_mm}, ${original.gap_y_mm}, ${original.offset_x_mm}, ${original.offset_y_mm},
          ${original.barcode_type}, ${original.font_scale}, ${original.barcode_height_scale},
          ${original.show_product_name}, ${original.show_price}, ${original.show_sku}, ${original.show_mrp},
          ${original.show_variant}, ${original.show_business_name}, ${original.show_date},
          ${Number(original.sheet_start_position || 1)},
          NOW(), NOW()
        )
        RETURNING *
      `

      res.status(201).json({ data: shapeProfileRow(rows[0]) })
      return
    }

    // 4) Update profile fields
    const name = String(body.name || '').trim()
    if (!name) {
      res.status(400).json({ error: 'Profile name is required' })
      return
    }

    // Check unique name per business
    const duplicate = await sql`
      SELECT id FROM public.printer_profiles
      WHERE business_id = ${businessId} AND id != ${id} AND LOWER(TRIM(name)) = LOWER(${name})
      LIMIT 1
    `
    if (duplicate.length > 0) {
      res.status(400).json({ error: 'A profile with this name already exists' })
      return
    }

    const rows = await sql`
      UPDATE public.printer_profiles
      SET name = ${name},
          printer_type = ${String(body.printer_type || 'label')},
          size_id = ${String(body.size_id || '2_38x25')},
          orientation = ${String(body.orientation || 'portrait')},
          rotation = ${Number(body.rotation || 0)},
          margin_top_mm = ${Number(body.margin_top_mm || 0)},
          margin_right_mm = ${Number(body.margin_right_mm || 0)},
          margin_bottom_mm = ${Number(body.margin_bottom_mm || 0)},
          margin_left_mm = ${Number(body.margin_left_mm || 0)},
          gap_x_mm = ${Number(body.gap_x_mm ?? 2)},
          gap_y_mm = ${Number(body.gap_y_mm || 0)},
          offset_x_mm = ${Number(body.offset_x_mm || 0)},
          offset_y_mm = ${Number(body.offset_y_mm || 0)},
          barcode_type = ${String(body.barcode_type || 'CODE128')},
          font_scale = ${Number(body.font_scale || 1.0)},
          barcode_height_scale = ${Number(body.barcode_height_scale || 1.0)},
          show_product_name = ${body.show_product_name !== false},
          show_price = ${body.show_price !== false},
          show_sku = ${body.show_sku !== false},
          show_mrp = ${Boolean(body.show_mrp)},
          show_variant = ${body.show_variant !== false},
          show_business_name = ${body.show_business_name !== false},
          show_date = ${Boolean(body.show_date)},
          sheet_start_position = ${Number(body.sheet_start_position || 1)},
          updated_at = NOW()
      WHERE id = ${id} AND business_id = ${businessId}
      RETURNING *
    `

    if (rows.length === 0) {
      res.status(404).json({ error: 'Profile not found' })
      return
    }

    res.status(200).json({ data: shapeProfileRow(rows[0]) })
    return
  }

  // Otherwise, handle custom size or last used size
  if (body.action === 'set_last_used' || (body.last_used_size_id !== undefined && !body.name)) {
    const lastUsedSizeId = String(body.last_used_size_id || '').trim()
    if (!lastUsedSizeId) {
      res.status(400).json({ error: 'last_used_size_id is required' })
      return
    }

    await sql`
      INSERT INTO public.business_label_settings (business_id, last_used_size_id, updated_at)
      VALUES (${businessId}, ${lastUsedSizeId}, NOW())
      ON CONFLICT (business_id) DO UPDATE
      SET last_used_size_id = EXCLUDED.last_used_size_id, updated_at = NOW()
    `

    res.status(200).json({ data: { success: true, last_used_size_id: lastUsedSizeId } })
    return
  }

  const id = String(body.id || req.query.id || '').trim()
  if (!id) {
    res.status(400).json({ error: 'Custom size ID is required for update' })
    return
  }

  const rawName = String(body.name || body.label || '').trim()
  if (!rawName) {
    res.status(400).json({ error: 'Name is required' })
    return
  }

  const widthMm = Number(body.width_mm ?? body.widthMm)
  const heightMm = Number(body.height_mm ?? body.heightMm)
  const columns = Math.round(Number(body.columns ?? body.labelsPerRow ?? 1))
  const gapMm = Number(body.gap_mm ?? body.horizontalGapMm ?? 0)

  if (isNaN(widthMm) || widthMm < 10 || widthMm > 210) {
    res.status(400).json({ error: 'Width must be between 10 mm and 210 mm' })
    return
  }
  if (isNaN(heightMm) || heightMm < 10 || heightMm > 210) {
    res.status(400).json({ error: 'Height must be between 10 mm and 210 mm' })
    return
  }
  if (isNaN(columns) || columns < 1 || columns > 10) {
    res.status(400).json({ error: 'Columns must be between 1 and 10' })
    return
  }
  if (isNaN(gapMm) || gapMm < 0 || gapMm > 50) {
    res.status(400).json({ error: 'Gap must be between 0 mm and 50 mm' })
    return
  }

  const rows = await sql`
    UPDATE public.custom_label_sizes
    SET name = ${rawName},
        width_mm = ${widthMm},
        height_mm = ${heightMm},
        columns = ${columns},
        gap_mm = ${gapMm},
        updated_at = NOW()
    WHERE id = ${id} AND business_id = ${businessId}
    RETURNING id, business_id, name, width_mm::float, height_mm::float, columns::int, gap_mm::float, created_at, updated_at
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Custom label size not found for this business' })
    return
  }

  res.status(200).json({ data: shapeSizeRow(rows[0]) })
}

// ==================== DELETE ====================
async function remove(req: VercelRequest, res: VercelResponse) {
  const businessId = getBusinessId(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const id = String(req.query.id || body.id || '').trim()
  const isProfile = req.query.resource === 'profiles' || body.resource === 'profiles'

  if (!id) {
    res.status(400).json({ error: 'ID is required for deletion' })
    return
  }

  if (isProfile) {
    const countRows = await sql`
      SELECT COUNT(*)::int AS count FROM public.printer_profiles WHERE business_id = ${businessId}
    `
    if ((countRows[0]?.count || 0) <= 1) {
      res.status(400).json({ error: 'Cannot delete the only remaining profile' })
      return
    }

    const targetRows = await sql`
      SELECT is_default FROM public.printer_profiles WHERE id = ${id} AND business_id = ${businessId}
    `
    if (targetRows.length === 0) {
      res.status(404).json({ error: 'Printer profile not found' })
      return
    }

    const wasDefault = Boolean(targetRows[0].is_default)

    await sql`
      DELETE FROM public.printer_profiles
      WHERE id = ${id} AND business_id = ${businessId}
    `

    // If default was deleted, make another one default
    let promotedDefaultId: string | null = null
    if (wasDefault) {
      const promoteRows = await sql`
        UPDATE public.printer_profiles
        SET is_default = true, updated_at = NOW()
        WHERE id = (
          SELECT id FROM public.printer_profiles
          WHERE business_id = ${businessId}
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING id
      `
      if (promoteRows.length > 0) {
        promotedDefaultId = String(promoteRows[0].id)
      }
    }

    res.status(200).json({ data: { success: true, id, promoted_default_id: promotedDefaultId } })
    return
  }

  const rows = await sql`
    DELETE FROM public.custom_label_sizes
    WHERE id = ${id} AND business_id = ${businessId}
    RETURNING id
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Custom label size not found for this business' })
    return
  }

  res.status(200).json({ data: { success: true, id } })
}

export default methodRouter({
  GET: get,
  POST: create,
  PUT: update,
  DELETE: remove,
})
