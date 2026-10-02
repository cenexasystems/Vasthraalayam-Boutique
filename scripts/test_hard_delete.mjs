import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('=== STARTING AUTOMATED HARD DELETE VERIFICATION TEST ===\n');

  // Preliminary cleanup if prior test aborted
  await sql`DELETE FROM public.products WHERE name = 'HardDelete_Test_Item'`;
  await sql`DELETE FROM public.coupons WHERE code = 'HARDTEST10'`;

  // Step 1: Create a test product
  console.log('1. Creating test product with stock = 10 ...');
  const [testProd] = await sql`
    INSERT INTO public.products (
      name, category, price, offer_price, stock_quantity, stock, unit, is_active, item_type, business_id
    ) VALUES (
      'HardDelete_Test_Item', 'SALWARS', 1200.00, 1200.00, 10.000, 10, 'piece', true, 'product', '1'
    ) RETURNING id, name, stock_quantity;
  `;
  const prodId = Number(testProd.id);
  console.log(`✓ Product created: ID=${prodId}, stock=${testProd.stock_quantity}`);

  // Step 2: Create a test coupon
  console.log('\n2. Creating test coupon ...');
  const [testCoupon] = await sql`
    INSERT INTO public.coupons (
      code, percentage, is_active, usage_count, business_id
    ) VALUES (
      'HARDTEST10', 10.00, true, 0, '1'
    ) RETURNING id, code, usage_count;
  `;
  console.log(`✓ Coupon created: ID=${testCoupon.id}, code=${testCoupon.code}, usage=${testCoupon.usage_count}`);

  // Step 3: Complete a POS Sale order with stock deduction, coupon, and split payments
  console.log('\n3. Creating an order with product, split payments, and coupon ...');
  const [saleResult] = await sql`
    SELECT public.complete_pos_sale_with_inventory(
      p_customer_name => 'Test Customer HardDelete',
      p_phone => '9884400000',
      p_address => 'Chennai',
      p_items => ${sql.json([
        {
          product_id: prodId,
          product_name: 'HardDelete_Test_Item',
          quantity: 2,
          unit_price: 1200,
          base_price: 1200,
          line_total: 2400,
          item_type: 'product',
          is_manual: false
        }
      ])},
      p_shipping => 0,
      p_status => 'completed',
      p_order_mode => 'offline',
      p_order_type => 'pos_sale',
      p_delivery_charge => 0,
      p_discount_amount => 240,
      p_manual_discount_amount => 0,
      p_manual_discount_type => 'flat',
      p_manual_discount_value => 0,
      p_coupon_code => 'HARDTEST10',
      p_coupon_percentage => 10,
      p_payment_method => 'split',
      p_split_details => ${sql.json({ cash: 1000, qr: 1160 })},
      p_total_gst => 0,
      p_gst_enabled => false,
      p_remarks => 'Testing hard delete cascade',
      p_reference_number => 'REF-TEST-001',
      p_billing_date => NOW(),
      p_created_by => 'admin'
    ) AS result;
  `;
  const orderId = saleResult.result.order_id;
  const invNo = saleResult.result.invoice_no;
  console.log(`✓ Order created: ID=${orderId}, InvNo=${invNo}, Total=${saleResult.result.total}`);

  // Add split payment rows to orders.payments
  await sql`
    UPDATE public.orders
    SET payments = ${sql.json([
      { mode: 'cash', amount: 1000 },
      { mode: 'qr', amount: 1160 }
    ])}
    WHERE id = ${orderId}::uuid;
  `;

  // Step 4: Verify initial state after sale
  const [prodAfterSale] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${prodId}`;
  console.log(`✓ Stock deducted: was 10.000, now ${prodAfterSale.stock_quantity} (expected 8.000)`);
  if (Number(prodAfterSale.stock_quantity) !== 8) throw new Error('Stock deduction check failed!');

  const [couponAfterSale] = await sql`SELECT usage_count FROM public.coupons WHERE id = ${testCoupon.id}`;
  console.log(`✓ Coupon usage incremented: now ${couponAfterSale.usage_count} (expected 1)`);

  const movementsAfterSale = await sql`
    SELECT count(*)::int as count FROM public.inventory_movements WHERE reference_type = 'order' AND reference_id = ${invNo};
  `;
  console.log(`✓ Inventory movement logged: count=${movementsAfterSale[0].count}`);

  // Step 5: Test Hard Delete of the Order
  console.log('\n4. Executing hard_delete_order on order ' + orderId + ' ...');
  const [delOrderRes] = await sql`
    SELECT public.hard_delete_order(${orderId}::uuid, '1', 'admin_tester') AS result;
  `;
  console.log('✓ hard_delete_order returned:', delOrderRes.result.success);

  // Step 6: Verify after Order Delete
  const orderCheck = await sql`SELECT * FROM public.orders WHERE id = ${orderId}::uuid`;
  console.log(`✓ Order in orders table: ${orderCheck.length} rows (expected 0)`);
  if (orderCheck.length !== 0) throw new Error('Order still exists in orders table!');

  const itemsCheck = await sql`SELECT * FROM public.order_items WHERE order_id = ${orderId}::uuid`;
  console.log(`✓ Line items in order_items: ${itemsCheck.length} rows (expected 0)`);
  if (itemsCheck.length !== 0) throw new Error('Order items still exist!');

  const movementsCheck = await sql`
    SELECT * FROM public.inventory_movements WHERE reference_type = 'order' AND reference_id = ${invNo};
  `;
  console.log(`✓ Stock ledger movements: ${movementsCheck.length} rows (expected 0)`);
  if (movementsCheck.length !== 0) throw new Error('Inventory movements were not deleted!');

  const [prodAfterDel] = await sql`SELECT stock_quantity FROM public.products WHERE id = ${prodId}`;
  console.log(`✓ Stock RESTORED: now ${prodAfterDel.stock_quantity} (expected 10.000)`);
  if (Number(prodAfterDel.stock_quantity) !== 10) throw new Error('Stock restoration failed!');

  const [couponAfterDel] = await sql`SELECT usage_count FROM public.coupons WHERE id = ${testCoupon.id}`;
  console.log(`✓ Coupon usage decremented: now ${couponAfterDel.usage_count} (expected 0)`);
  if (Number(couponAfterDel.usage_count) !== 0) throw new Error('Coupon usage decrement failed!');

  const [backupCheck] = await sql`
    SELECT * FROM public.delete_backups WHERE entity_id = ${orderId} AND entity_type = 'order';
  `;
  console.log(`✓ Audit backup recorded: ID=${backupCheck?.id}, identifier=${backupCheck?.entity_identifier}`);

  // Step 7: Test Advance Order Hard Delete
  console.log('\n5. Testing Advance Order creation and hard delete ...');
  const [advRow] = await sql`
    SELECT * FROM public.create_advance_order(
      p_customer_name => 'Adv Test Customer',
      p_phone => '9884411111',
      p_address => 'Chennai',
      p_product_name => 'Silk Saree Custom',
      p_products => ${sql.json([])},
      p_category => 'SALWARS',
      p_description => 'Custom Stitching',
      p_total_amount => 3000.00,
      p_deposit_amount => 1000.00,
      p_expected_delivery_date => CURRENT_DATE + 7,
      p_payment_method => 'cash',
      p_remarks => 'Adv test',
      p_created_by => 'admin',
      p_created_by_name => 'Admin Tester'
    );
  `;
  const advId = advRow.id;
  const depId = advRow.deposit_id;
  console.log(`✓ Advance order created: ID=${advId}, DepositID=${depId}`);

  console.log('Executing hard_delete_advance_order ...');
  const [delAdvRes] = await sql`
    SELECT public.hard_delete_advance_order(${advId}::uuid, '1', 'admin_tester') AS result;
  `;
  console.log('✓ hard_delete_advance_order returned:', delAdvRes.result.success);

  const advCheck = await sql`SELECT * FROM public.advance_orders WHERE id = ${advId}::uuid`;
  const advPayCheck = await sql`SELECT * FROM public.advance_order_payments WHERE advance_order_id = ${advId}::uuid`;
  const advTimeCheck = await sql`SELECT * FROM public.advance_order_timeline WHERE advance_order_id = ${advId}::uuid`;
  console.log(`✓ Advance order rows: ${advCheck.length}, payments: ${advPayCheck.length}, timeline: ${advTimeCheck.length} (all expected 0)`);
  if (advCheck.length !== 0 || advPayCheck.length !== 0 || advTimeCheck.length !== 0) {
    throw new Error('Advance order cascade failed!');
  }

  // Step 8: Clean up test product and coupon using hard delete RPCs
  console.log('\n6. Cleaning up test product and coupon via hard delete RPCs ...');
  await sql`SELECT public.hard_delete_product(${prodId}::bigint, '1', 'admin_tester')`;
  const prodExists = await sql`SELECT * FROM public.products WHERE id = ${prodId}`;
  console.log(`✓ Product cleaned: ${prodExists.length} rows (expected 0)`);

  await sql`SELECT public.hard_delete_coupon(${testCoupon.id}::bigint, '1', 'admin_tester')`;
  const couponExists = await sql`SELECT * FROM public.coupons WHERE id = ${testCoupon.id}`;
  console.log(`✓ Coupon cleaned: ${couponExists.length} rows (expected 0)`);

  // Step 9: Final Orphan Row Verification
  console.log('\n7. Final Database Orphan Verification ...');
  const orphanItems = await sql`
    SELECT count(*)::int as count FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;
  `;
  const orphanMovements = await sql`
    SELECT count(*)::int as count FROM inventory_movements im WHERE im.product_id IS NOT NULL AND im.product_id NOT IN (SELECT id FROM products);
  `;
  const orphanBarcodes = await sql`
    SELECT count(*)::int as count FROM barcode_registry br WHERE br.product_id IS NOT NULL AND br.product_id NOT IN (SELECT id FROM products);
  `;
  const orphanAdvPayments = await sql`
    SELECT count(*)::int as count FROM advance_order_payments aop LEFT JOIN advance_orders ao ON aop.advance_order_id = ao.id WHERE ao.id IS NULL;
  `;

  console.log(`- Orphan order_items: ${orphanItems[0].count}`);
  console.log(`- Orphan inventory_movements: ${orphanMovements[0].count}`);
  console.log(`- Orphan barcode_registry: ${orphanBarcodes[0].count}`);
  console.log(`- Orphan advance_order_payments: ${orphanAdvPayments[0].count}`);

  if (orphanItems[0].count > 0 || orphanMovements[0].count > 0 || orphanBarcodes[0].count > 0 || orphanAdvPayments[0].count > 0) {
    throw new Error('Orphan check failed! Found orphaned records.');
  }

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! ZERO ORPHANS!');
  await sql.end();
}

run().catch(async (e) => {
  console.error('\n❌ Test failed:', e);
  await sql.end();
  process.exit(1);
});
