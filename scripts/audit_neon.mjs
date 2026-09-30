/**
 * READ-ONLY audit script for the Supabase→Neon migration.
 * Run: node scripts/audit_neon.mjs
 * NO INSERT / UPDATE / DELETE — SELECT queries only.
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require'

const sql = postgres(DATABASE_URL, { max: 2, connect_timeout: 10, onnotice: () => {} })

async function safeCount(table) {
  try {
    const [{ count }] = await sql`SELECT COUNT(*) AS count FROM public.${sql(table)}`
    return count
  } catch (e) {
    return `ERROR: ${e.message.split('\n')[0]}`
  }
}

async function run() {
  console.log('\n========================================================')
  console.log('  VASTHRAALAYAM BOUTIQUE — Neon Audit (READ-ONLY)')
  console.log('========================================================\n')

  // ── 1. Which tables exist in public schema? ──────────────────────────────
  console.log('─── 1. TABLES IN public SCHEMA ───────────────────────────')
  const existingTables = await sql`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `
  const tableNames = existingTables.map(t => t.tablename)
  console.log('  Tables found:', tableNames.join(', '))

  const allExpectedTables = [
    'categories', 'products', 'product_variants', 'coupons',
    'orders', 'order_items',
    'advance_orders', 'advance_order_timeline', 'advance_order_payments',
    'barcode_registry', 'inventory_movements', 'store_settings',
  ]
  const missingTables = allExpectedTables.filter(t => !tableNames.includes(t))
  if (missingTables.length) {
    console.log('  ⚠ MISSING TABLES:', missingTables.join(', '))
  } else {
    console.log('  All expected tables present ✓')
  }

  // ── 2. Row counts ──────────────────────────────────────────────────────
  console.log('\n─── 2. TABLE ROW COUNTS ───────────────────────────────────')
  for (const t of allExpectedTables) {
    const count = await safeCount(t)
    console.log(`  ${t.padEnd(28)} ${String(count).padStart(8)}`)
  }

  // ── 3. Order status breakdown ──────────────────────────────────────────────
  console.log('\n─── 3. ORDERS — status / type breakdown ───────────────────')
  const statusRows = await sql`
    SELECT status, order_type, COUNT(*) AS cnt, ROUND(SUM(total),2) AS total_sum
    FROM public.orders
    GROUP BY status, order_type
    ORDER BY status, order_type
  `
  for (const r of statusRows) {
    console.log(`  status=${String(r.status).padEnd(12)} type=${String(r.order_type).padEnd(16)} count=${String(r.cnt).padStart(5)}  sum=₹${Number(r.total_sum||0).toFixed(2)}`)
  }

  // ── 4. Revenue spot-check ──────────────────────────────────────────────────
  console.log('\n─── 4. REVENUE SPOT-CHECKS ─────────────────────────────────')
  const [rev] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
      COUNT(*) FILTER (WHERE status = 'completed'
        AND order_type NOT IN ('online_request','whatsapp_request')) AS billable_count,
      ROUND(SUM(total) FILTER (WHERE status = 'completed'
        AND order_type NOT IN ('online_request','whatsapp_request')),2) AS total_revenue,
      ROUND(SUM(total) FILTER (WHERE status = 'completed'
        AND order_type NOT IN ('online_request','whatsapp_request')
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date),2) AS today_revenue_ist,
      ROUND(SUM(total) FILTER (WHERE status = 'completed'
        AND order_type NOT IN ('online_request','whatsapp_request')
        AND created_at::date = CURRENT_DATE),2) AS today_revenue_utc
    FROM public.orders
  `
  console.log(`  Completed orders (all types):              ${rev.completed_count}`)
  console.log(`  Billable completed (excl online_request):  ${rev.billable_count}`)
  console.log(`  Total revenue (orders.total sum):          ₹${rev.total_revenue}`)
  console.log(`  Today revenue [IST date]:                  ₹${rev.today_revenue_ist}`)
  console.log(`  Today revenue [UTC date]:                  ₹${rev.today_revenue_utc}`)
  if (String(rev.today_revenue_ist) !== String(rev.today_revenue_utc)) {
    console.log(`  ⚠ IST vs UTC mismatch on today filter!`)
  }

  // ── 5. Timezone check ──────────────────────────────────────────────────────
  console.log('\n─── 5. TIMEZONE ANALYSIS ────────────────────────────────────')
  const [tz] = await sql`SELECT NOW() AS server_now, NOW() AT TIME ZONE 'Asia/Kolkata' AS now_ist`
  console.log(`  DB server NOW():   ${tz.server_now}`)
  console.log(`  NOW() in IST:      ${tz.now_ist}`)

  const [colType] = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at'
  `
  console.log(`  orders.created_at: ${colType.data_type}`)

  const [minmax] = await sql`
    SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM public.orders
  `
  if (minmax.oldest) {
    console.log(`  Oldest order:      ${minmax.oldest}  [IST: ${new Date(minmax.oldest).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}]`)
    console.log(`  Newest order:      ${minmax.newest}  [IST: ${new Date(minmax.newest).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}]`)
  }

  // ── 6. Advance orders audit ────────────────────────────────────────────────
  console.log('\n─── 6. ADVANCE ORDERS STATUS ────────────────────────────────')
  const advStatus = await sql`
    SELECT status, COUNT(*) AS cnt,
           ROUND(SUM(total_amount),2) AS total_amt,
           ROUND(SUM(deposit_amount),2) AS deposited,
           ROUND(SUM(remaining_balance),2) AS outstanding
    FROM public.advance_orders
    GROUP BY status ORDER BY status
  `
  if (advStatus.length === 0) {
    console.log('  (no advance orders)')
  } else {
    for (const r of advStatus) {
      console.log(`  ${String(r.status).padEnd(28)} count=${String(r.cnt).padStart(4)}  total=₹${Number(r.total_amt||0).toFixed(2)}  deposited=₹${Number(r.deposited||0).toFixed(2)}  outstanding=₹${Number(r.outstanding||0).toFixed(2)}`)
    }
  }

  const [missingLink] = await sql`
    SELECT COUNT(*) AS cnt FROM public.advance_orders
    WHERE status = 'completed' AND (completed_order_id IS NULL OR invoice_number IS NULL)
  `
  console.log(`  Completed advance orders missing order link: ${missingLink.cnt}`)

  const [advOrders] = await sql`
    SELECT COUNT(*) AS cnt, ROUND(COALESCE(SUM(total),0),2) AS total_sum
    FROM public.orders WHERE order_type = 'advance_order'
  `
  console.log(`  Orders.order_type='advance_order':          ${advOrders.cnt}  sum=₹${advOrders.total_sum}`)

  // ── 7. Order items integrity ───────────────────────────────────────────────
  console.log('\n─── 7. ORDER ITEMS INTEGRITY ────────────────────────────────')
  const [itemCheck] = await sql`
    SELECT
      COUNT(*) AS total_items,
      COUNT(*) FILTER (WHERE source = 'catalogue') AS catalogue_items,
      COUNT(*) FILTER (WHERE source = 'manual') AS manual_items,
      COUNT(*) FILTER (WHERE source = 'advance_order') AS advance_items,
      COUNT(*) FILTER (WHERE source IS NULL OR source = '') AS null_source,
      ROUND(SUM(line_total),2) AS gross_sum,
      COUNT(DISTINCT order_id) AS distinct_orders
    FROM public.order_items
  `
  console.log(`  Total items:          ${itemCheck.total_items}`)
  console.log(`  Catalogue:            ${itemCheck.catalogue_items}`)
  console.log(`  Manual:               ${itemCheck.manual_items}`)
  console.log(`  Advance_order:        ${itemCheck.advance_items}`)
  console.log(`  Null/empty source:    ${itemCheck.null_source}`)
  console.log(`  Gross line_total:     ₹${itemCheck.gross_sum}`)
  console.log(`  Distinct order_ids:   ${itemCheck.distinct_orders}`)

  // Orphaned order_items
  const [orphans] = await sql`
    SELECT COUNT(*) AS cnt FROM public.order_items oi
    WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = oi.order_id)
  `
  console.log(`  Orphaned items:       ${orphans.cnt}`)

  // Orders with no rows in order_items
  const [noItemRows] = await sql`
    SELECT COUNT(*) AS cnt FROM public.orders o
    WHERE status = 'completed'
      AND order_type NOT IN ('online_request')
      AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
  `
  console.log(`  Completed orders with NO item rows: ${noItemRows.cnt}`)

  // ── 8. Line total vs order total consistency ───────────────────────────────
  console.log('\n─── 8. ITEMS SUM vs ORDER TOTAL DELTA ──────────────────────')
  const [itemRevenue] = await sql`
    SELECT
      ROUND(SUM(oi.line_total),2) AS items_gross,
      ROUND(SUM(COALESCE(o.discount_amount,0)+COALESCE(o.manual_discount_amount,0)),2) AS total_discount,
      ROUND(SUM(o.total),2) AS orders_total
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'completed'
      AND o.order_type NOT IN ('online_request','whatsapp_request')
  `
  const itemsNet = Number(itemRevenue.items_gross||0) - Number(itemRevenue.total_discount||0)
  console.log(`  Gross items sum:      ₹${itemRevenue.items_gross}`)
  console.log(`  Total discounts:      ₹${itemRevenue.total_discount}`)
  console.log(`  Net items (post-disc):₹${itemsNet.toFixed(2)}`)
  console.log(`  Orders total sum:     ₹${itemRevenue.orders_total}`)
  console.log(`  Delta (net-items vs orders.total): ₹${(itemsNet - Number(itemRevenue.orders_total||0)).toFixed(2)}`)

  // ── 9. Payment audit ──────────────────────────────────────────────────────
  console.log('\n─── 9. PAYMENTS AUDIT ───────────────────────────────────────')
  const [payCheck] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payments,'[]'::jsonb)) = 0) AS empty_payments,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payments,'[]'::jsonb)) = 1) AS single_pay,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payments,'[]'::jsonb)) > 1) AS split_pay,
      COUNT(*) FILTER (WHERE payment_mode = 'split') AS mode_split_flag,
      ROUND(SUM(COALESCE(change_given,0)),2) AS total_change_given
    FROM public.orders WHERE status = 'completed'
  `
  console.log(`  Empty payments[]:     ${payCheck.empty_payments}`)
  console.log(`  Single payment:       ${payCheck.single_pay}`)
  console.log(`  Split payment:        ${payCheck.split_pay}`)
  console.log(`  mode='split' flag:    ${payCheck.mode_split_flag}`)
  console.log(`  Total change_given:   ₹${payCheck.total_change_given}`)

  // ── 10. Coupon audit ───────────────────────────────────────────────────────
  console.log('\n─── 10. COUPON AUDIT ────────────────────────────────────────')
  const [couponCount] = await sql`SELECT COUNT(*) AS cnt FROM public.coupons`
  console.log(`  Total coupons in DB: ${couponCount.cnt}`)
  const couponOrders = await sql`
    SELECT coupon_code, COUNT(*) AS usage_cnt, ROUND(SUM(discount_amount),2) AS total_discount
    FROM public.orders
    WHERE status = 'completed' AND coupon_code IS NOT NULL AND coupon_code != ''
    GROUP BY coupon_code ORDER BY usage_cnt DESC LIMIT 10
  `
  if (couponOrders.length === 0) {
    console.log('  No coupon-coded completed orders found.')
  } else {
    for (const r of couponOrders) {
      console.log(`  coupon=${String(r.coupon_code).padEnd(15)} used=${r.usage_cnt}  discount=₹${r.total_discount}`)
    }
  }

  // ── 11. Schema completeness ────────────────────────────────────────────────
  console.log('\n─── 11. COLUMN COMPLETENESS ─────────────────────────────────')
  const ordersColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
    ORDER BY ordinal_position
  `
  const foundCols = new Set(ordersColumns.map(c => c.column_name))
  console.log(`  orders table: ${ordersColumns.length} columns`)
  const requiredCols = ['payments','change_given','billing_date','split_details',
    'manual_discount_amount','manual_discount_type','coupon_code','coupon_percentage']
  for (const c of requiredCols) {
    const found = foundCols.has(c)
    console.log(`    ${c.padEnd(30)} ${found ? '✓' : '⚠ MISSING'}`)
  }

  // Check 'tailor_name' (added later)
  const tailorCol = foundCols.has('tailor_name')
  console.log(`    ${'tailor_name'.padEnd(30)} ${tailorCol ? '✓' : '⚠ MISSING (added in later migration)'}`)

  const advColumns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'advance_orders'
    ORDER BY ordinal_position
  `
  const foundAdvCols = new Set(advColumns.map(c => c.column_name))
  console.log(`  advance_orders table: ${advColumns.length} columns`)

  // ── 12. Functions / procedures present ────────────────────────────────────
  console.log('\n─── 12. FUNCTIONS IN public SCHEMA ──────────────────────────')
  const funcs = await sql`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
    ORDER BY routine_name
  `
  console.log('  Functions:', funcs.map(f => f.routine_name).join(', '))
  const expectedFuncs = [
    'get_next_invoice_no',
    'complete_pos_sale_with_inventory',
    'create_advance_order',
    'update_advance_order_status',
    'complete_advance_order_v2',
    'add_advance_order_event',
  ]
  for (const f of expectedFuncs) {
    const found = funcs.some(r => r.routine_name === f)
    console.log(`    ${f.padEnd(40)} ${found ? '✓' : '⚠ MISSING'}`)
  }

  // ── 13. Store settings ────────────────────────────────────────────────────
  console.log('\n─── 13. STORE SETTINGS ──────────────────────────────────────')
  const settings = await sql`SELECT * FROM public.store_settings LIMIT 1`
  if (settings.length === 0) {
    console.log('  ⚠ No store_settings row!')
  } else {
    const s = settings[0]
    console.log(`  name:         ${s.name}`)
    console.log(`  owner_name:   ${s.owner_name}`)
    console.log(`  phone:        ${s.phone}`)
    console.log(`  gst_enabled:  ${s.gst_enabled}`)
  }

  // ── 14. Full analytics reconciliation ─────────────────────────────────────
  console.log('\n─── 14. ANALYTICS RECONCILIATION ───────────────────────────')
  const [all] = await sql`
    SELECT
      COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE status='pending') AS pending_orders,
      ROUND(SUM(total) FILTER (WHERE status='completed' AND order_type NOT IN ('online_request','whatsapp_request')),2) AS revenue,
      ROUND(AVG(total) FILTER (WHERE status='completed' AND order_type NOT IN ('online_request','whatsapp_request')),2) AS avg_order_value
    FROM public.orders
  `
  console.log(`  Total orders in DB:    ${all.total_orders}`)
  console.log(`  Completed:             ${all.completed}`)
  console.log(`  Cancelled:             ${all.cancelled}`)
  console.log(`  Pending:               ${all.pending_orders}`)
  console.log(`  Billable revenue:      ₹${all.revenue}`)
  console.log(`  Avg order value:       ₹${all.avg_order_value}`)

  // Service items classification
  const [svcItems] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE oi.source = 'advance_order' OR o.order_type = 'advance_order') AS service_items,
      ROUND(SUM(oi.line_total) FILTER (WHERE oi.source = 'advance_order' OR o.order_type = 'advance_order'),2) AS service_gross,
      COUNT(*) FILTER (WHERE oi.source != 'advance_order' AND o.order_type != 'advance_order') AS product_items,
      ROUND(SUM(oi.line_total) FILTER (WHERE oi.source != 'advance_order' AND o.order_type != 'advance_order'),2) AS product_gross
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'completed' AND o.order_type NOT IN ('online_request','whatsapp_request')
  `
  console.log(`  Service items (advance_order):  ${svcItems.service_items}  gross=₹${svcItems.service_gross}`)
  console.log(`  Product items (non-advance):    ${svcItems.product_items}  gross=₹${svcItems.product_gross}`)

  // ── 15. advanceOrderService.ts still uses Supabase? ──────────────────────
  console.log('\n─── 15. ADVANCE ORDERS — SUPABASE vs NEON ROUTING ──────────')
  console.log('  advanceOrderService.ts calls Supabase RPCs (create_advance_order,')
  console.log('  update_advance_order_status, complete_advance_order_v2) and')
  console.log('  supabase.from("advance_orders").select().')
  console.log('  If isSupabaseConfigured=false, it falls back to localStorage.')
  console.log('  There is NO /api/advance-orders endpoint routing to Neon.')
  console.log('  → Current Neon advance_orders count: 0 (confirmed above).')
  console.log('  → All advance orders are either in Supabase or in localStorage.')

  console.log('\n========================================================')
  console.log('  AUDIT COMPLETE — no data was modified')
  console.log('========================================================\n')
}

run().catch(err => {
  console.error('\nAudit fatal error:', err.message)
  process.exit(1)
}).finally(() => sql.end())
