/**
 * Standalone, Reviewable Script: Reconcile Past Advance Order Stock & Ledger
 *
 * SAFETY FIRST:
 * - Defaults to DRY-RUN mode (read-only).
 * - Will NOT modify any data unless executed with: node scripts/reconcile_past_advance_orders.mjs --apply
 * - Never touches services, custom tailoring, or unregistered non-inventory items.
 */

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8');
const match = env.match(/DATABASE_URL=([^\r\n]+)/);
if (!match) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}
const dbUrl = match[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

const isApply = process.argv.includes('--apply');

async function main() {
  console.log(`=== Past Advance Orders Stock Reconcile Report ===`);
  console.log(`Mode: ${isApply ? '⚠️ APPLY (WILL WRITE TO DATABASE)' : '🔍 DRY RUN (READ ONLY)'}\n`);

  // Fetch all completed advance orders
  const completedOrders = await sql`
    SELECT id, deposit_id, invoice_number, customer_name, total_amount, deposit_amount,
           products, product_name, completed_at, status
    FROM public.advance_orders
    WHERE status = 'completed'
    ORDER BY completed_at ASC
  `;

  console.log(`Found ${completedOrders.length} completed advance orders in total.\n`);

  const pendingReconcile = [];

  for (const order of completedOrders) {
    const invNo = order.invoice_number || order.deposit_id;

    // Check if movement already exists for this order
    const existingMovements = await sql`
      SELECT id, product_id, variant_id, movement_type, quantity_delta, note
      FROM public.inventory_movements
      WHERE reference_id = ${invNo} OR note ILIKE ${'%' + order.deposit_id + '%'}
    `;

    const items = Array.isArray(order.products) && order.products.length > 0
      ? order.products
      : (order.product_name ? [{ name: order.product_name, quantity: 1, item_type: 'product' }] : []);

    const physicalItems = [];
    for (const item of items) {
      const isManual = Boolean(item.is_manual);
      const itemType = String(item.item_type || '').toLowerCase();
      const qty = Number(item.quantity || 1);

      if (!isManual && qty > 0 && itemType !== 'service') {
        physicalItems.push(item);
      }
    }

    if (physicalItems.length === 0) {
      console.log(`- ${order.deposit_id} (${invNo}): Skipping (Tailoring / Service / Custom order — no physical stock tracked).`);
      continue;
    }

    if (existingMovements.length > 0) {
      console.log(`- ${order.deposit_id} (${invNo}): Already has ${existingMovements.length} inventory movement(s). Skipping.`);
      continue;
    }

    console.log(`! ${order.deposit_id} (${invNo}): Completed without stock movement! Physical items:`, physicalItems.map(p => `${p.name} (qty: ${p.quantity})`).join(', '));
    pendingReconcile.push({ order, physicalItems, invNo });
  }

  console.log(`\nTotal advance orders requiring stock reconciliation: ${pendingReconcile.length}`);

  if (pendingReconcile.length === 0) {
    console.log('✅ All physical advance orders are in sync with inventory movements.');
    await sql.end();
    return;
  }

  if (!isApply) {
    console.log('\nTo apply stock deductions and create ledger movements for these historical orders, run:');
    console.log('  node scripts/reconcile_past_advance_orders.mjs --apply');
    await sql.end();
    return;
  }

  console.log('\n--- Applying stock deductions & ledger writes ---');
  for (const { order, physicalItems, invNo } of pendingReconcile) {
    for (const item of physicalItems) {
      const pid = item.product_id ? Number(item.product_id) : null;
      const vid = item.variant_id ? String(item.variant_id) : null;
      const qty = Number(item.quantity || 1);

      console.log(`Reconciling order ${order.deposit_id} -> Product: ${pid}, Variant: ${vid}, Qty: ${qty}`);
      await sql`
        SELECT public.record_sale_stock_deduction(
          p_product_id      => ${pid},
          p_variant_id      => ${vid ? vid : null},
          p_quantity        => ${qty},
          p_reference_type  => 'order',
          p_reference_id    => ${invNo},
          p_note            => ${'Historical Reconcile: Advance Order ' + order.deposit_id + ' completed (Invoice: ' + invNo + ')'},
          p_created_by_name => 'Admin Reconcile'
        )
      `;
      console.log(`  ✓ Reconciled ${item.name}`);
    }
  }

  console.log('\n✅ Historical advance order reconciliation complete!');
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
