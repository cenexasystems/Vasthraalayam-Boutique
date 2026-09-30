require('dotenv').config()
const postgres = require('postgres')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

const sql = postgres(connectionString, { ssl: 'require' })

async function runTests() {
  console.log('Running Split Payment Tests against Neon DB...')

  // Test 1: Query an existing/old order and verify fallback
  const oldOrders = await sql`
    SELECT id, invoice_no, total, payment_mode, payments, change_given
    FROM public.orders
    ORDER BY created_at DESC
    LIMIT 3
  `
  console.log('\n--- Test 1: Existing Order Verification ---')
  oldOrders.forEach(o => {
    console.log(`Order #${o.invoice_no}: total=${o.total}, mode=${o.payment_mode}, change=${o.change_given}`)
    console.log(`payments: ${JSON.stringify(o.payments)}`)
    // Verification: payments is an array
    if (!Array.isArray(o.payments)) {
      throw new Error(`Order #${o.invoice_no} does not have array payments!`)
    }
  })

  // Test 2: Insert and verify ₹500 = 250 Cash + 250 QR
  console.log('\n--- Test 2: Split 250 Cash + 250 QR (Total 500) ---')
  const testInv1 = 'TEST-SPLIT-' + Date.now().toString().slice(-6)
  const payments1 = [
    { mode: 'cash', amount: 250 },
    { mode: 'qr', amount: 250 }
  ]
  const [res1] = await sql`
    INSERT INTO public.orders (
      invoice_no, total, subtotal, customer_name, status,
      payment_mode, payment_method, payments, change_given
    ) VALUES (
      ${testInv1}, 500, 500, 'Test Split Customer 1', 'completed',
      'split', 'split', ${sql.json(payments1)}, 0
    )
    RETURNING id, invoice_no, total, payment_mode, payments, change_given
  `
  console.log('Inserted:', res1)
  if (res1.payment_mode !== 'split' || res1.payments.length !== 2) {
    throw new Error('Test 2 failed!')
  }

  // Test 3: Insert and verify 250 Card + 250 Cash (Total 500)
  console.log('\n--- Test 3: Split 250 Card + 250 Cash (Total 500) ---')
  const testInv2 = 'TEST-SPLIT-' + (Date.now() + 1).toString().slice(-6)
  const payments2 = [
    { mode: 'card', amount: 250 },
    { mode: 'cash', amount: 250 }
  ]
  const [res2] = await sql`
    INSERT INTO public.orders (
      invoice_no, total, subtotal, customer_name, status,
      payment_mode, payment_method, payments, change_given
    ) VALUES (
      ${testInv2}, 500, 500, 'Test Split Customer 2', 'completed',
      'split', 'split', ${sql.json(payments2)}, 0
    )
    RETURNING id, invoice_no, total, payment_mode, payments, change_given
  `
  console.log('Inserted:', res2)
  if (res2.payment_mode !== 'split' || res2.payments.length !== 2) {
    throw new Error('Test 3 failed!')
  }

  // Test 4: Insert and verify 200 Cash + 200 QR + 100 Card (Total 500)
  console.log('\n--- Test 4: Split 200 Cash + 200 QR + 100 Card (Total 500) ---')
  const testInv3 = 'TEST-SPLIT-' + (Date.now() + 2).toString().slice(-6)
  const payments3 = [
    { mode: 'cash', amount: 200 },
    { mode: 'qr', amount: 200 },
    { mode: 'card', amount: 100 }
  ]
  const [res3] = await sql`
    INSERT INTO public.orders (
      invoice_no, total, subtotal, customer_name, status,
      payment_mode, payment_method, payments, change_given
    ) VALUES (
      ${testInv3}, 500, 500, 'Test Split Customer 3', 'completed',
      'split', 'split', ${sql.json(payments3)}, 0
    )
    RETURNING id, invoice_no, total, payment_mode, payments, change_given
  `
  console.log('Inserted:', res3)
  if (res3.payment_mode !== 'split' || res3.payments.length !== 3) {
    throw new Error('Test 4 failed!')
  }

  // Test 5: Cash overpayment: 200 QR + 350 Cash on ₹500 bill -> change_given 50
  console.log('\n--- Test 5: Cash Overpayment (200 QR + 350 Cash, Change 50) ---')
  const testInv4 = 'TEST-SPLIT-' + (Date.now() + 3).toString().slice(-6)
  const payments4 = [
    { mode: 'qr', amount: 200 },
    { mode: 'cash', amount: 350 }
  ]
  const [res4] = await sql`
    INSERT INTO public.orders (
      invoice_no, total, subtotal, customer_name, status,
      payment_mode, payment_method, payments, change_given
    ) VALUES (
      ${testInv4}, 500, 500, 'Test Split Customer 4', 'completed',
      'split', 'split', ${sql.json(payments4)}, 50
    )
    RETURNING id, invoice_no, total, payment_mode, payments, change_given
  `
  console.log('Inserted:', res4)
  if (Number(res4.change_given) !== 50) {
    throw new Error('Test 5 change_given failed!')
  }

  // Test 6: Verify SQL aggregation using jsonb_array_elements
  console.log('\n--- Test 6: SQL Aggregation using jsonb_array_elements(payments) ---')
  const aggResult = await sql`
    SELECT
      elem->>'mode' as mode,
      SUM((elem->>'amount')::numeric) as total_collected
    FROM public.orders,
    LATERAL jsonb_array_elements(payments) as elem
    WHERE invoice_no IN (${testInv1}, ${testInv2}, ${testInv3}, ${testInv4})
    GROUP BY elem->>'mode'
    ORDER BY mode
  `
  console.log('Aggregated revenue by mode:', aggResult)

  // Clean up test orders
  await sql`
    DELETE FROM public.orders
    WHERE invoice_no IN (${testInv1}, ${testInv2}, ${testInv3}, ${testInv4})
  `
  console.log('\nCleaned up temporary test orders.')
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✅')
  await sql.end()
}

runTests().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
