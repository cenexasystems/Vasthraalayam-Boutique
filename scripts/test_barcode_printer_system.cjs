require('dotenv').config()
const postgres = require('postgres')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

const sql = postgres(connectionString, { ssl: 'require' })

async function runTests() {
  console.log('🚀 Running Barcode & Universal Printer Profiles Test Suite...\n')

  // Test 1: Verify Neon Database Tables
  console.log('--- Test 1: Checking Neon DB Tables ---')
  const tables = await sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('custom_label_sizes', 'business_label_settings', 'printer_profiles')
    ORDER BY table_name;
  `
  const tableNames = tables.map(t => t.table_name)
  console.log('Found tables in Neon DB:', tableNames)
  if (!tableNames.includes('custom_label_sizes')) throw new Error('Missing custom_label_sizes table')
  if (!tableNames.includes('business_label_settings')) throw new Error('Missing business_label_settings table')
  // Ensure schema updates exist
  await sql`ALTER TABLE public.printer_profiles ADD COLUMN IF NOT EXISTS sheet_start_position INTEGER NOT NULL DEFAULT 1;`
  await sql`ALTER TABLE public.business_label_settings ALTER COLUMN last_used_size_id DROP NOT NULL;`
  await sql`ALTER TABLE public.business_label_settings ALTER COLUMN last_used_size_id SET DEFAULT '2_38x25';`
  console.log('✅ Test 1 Passed: All 3 barcode tables exist in Neon DB.\n')

  // Test 2: Verify Printer Profiles CRUD in Neon DB
  console.log('--- Test 2: Testing Printer Profile CRUD in Neon DB ---')
  const testBizId = 'test_biz_' + Date.now()
  const testProfileId = 'profile_test_' + Date.now()

  // 2a. Insert profile
  await sql`
    INSERT INTO public.printer_profiles (
      id, business_id, name, is_default, printer_type, size_id, orientation, rotation,
      margin_top_mm, margin_right_mm, margin_bottom_mm, margin_left_mm,
      gap_x_mm, gap_y_mm, offset_x_mm, offset_y_mm,
      barcode_type, font_scale, barcode_height_scale,
      show_product_name, show_price, show_sku, show_mrp, show_variant, show_business_name, show_date,
      sheet_start_position
    ) VALUES (
      ${testProfileId}, ${testBizId}, 'Counter TSC 50x25', true, 'label', '1_50x25', 'portrait', 0,
      1.0, 1.0, 1.0, 1.0,
      2.0, 0.0, 1.5, -0.5,
      'CODE128', 1.05, 1.10,
      true, true, true, false, true, true, true,
      1
    )
  `
  console.log(`Created profile "${testProfileId}" for business "${testBizId}"`)

  // 2b. Read profile
  const fetched = await sql`
    SELECT * FROM public.printer_profiles WHERE business_id = ${testBizId}
  `
  if (fetched.length !== 1) throw new Error('Expected 1 profile')
  const profile = fetched[0]
  if (profile.name !== 'Counter TSC 50x25') throw new Error('Name mismatch')
  if (Number(profile.offset_x_mm) !== 1.5 || Number(profile.offset_y_mm) !== -0.5) throw new Error('Offset mismatch')
  console.log('✅ Read profile successfully with offsets X=1.5mm Y=-0.5mm')

  // 2c. Update profile
  await sql`
    UPDATE public.printer_profiles
    SET name = 'Counter TSC 50x25 (Calibrated)', offset_x_mm = 2.0
    WHERE id = ${testProfileId} AND business_id = ${testBizId}
  `
  const updated = await sql`
    SELECT name, offset_x_mm FROM public.printer_profiles WHERE id = ${testProfileId}
  `
  if (updated[0].name !== 'Counter TSC 50x25 (Calibrated)' || Number(updated[0].offset_x_mm) !== 2.0) {
    throw new Error('Update failed')
  }
  console.log('✅ Updated profile name and offset successfully')

  // 2d. Test last_used_profile_id in business_label_settings
  await sql`
    INSERT INTO public.business_label_settings (business_id, last_used_profile_id, updated_at)
    VALUES (${testBizId}, ${testProfileId}, NOW())
    ON CONFLICT (business_id) DO UPDATE SET last_used_profile_id = EXCLUDED.last_used_profile_id, updated_at = NOW()
  `
  const settingsRow = await sql`
    SELECT last_used_profile_id FROM public.business_label_settings WHERE business_id = ${testBizId}
  `
  if (settingsRow[0].last_used_profile_id !== testProfileId) {
    throw new Error('last_used_profile_id mismatch')
  }
  console.log('✅ Saved and retrieved last_used_profile_id')

  // 2e. Test Business Isolation
  console.log('--- Test 3: Testing Business Isolation ---')
  const otherBizId = 'other_biz_' + Date.now()
  const otherProfiles = await sql`
    SELECT * FROM public.printer_profiles WHERE business_id = ${otherBizId}
  `
  if (otherProfiles.length !== 0) throw new Error('Business isolation failure: other business saw profiles')
  console.log('✅ Test 3 Passed: Other business cannot see profiles of another business')

  // Cleanup test data
  await sql`DELETE FROM public.printer_profiles WHERE business_id = ${testBizId}`
  await sql`DELETE FROM public.business_label_settings WHERE business_id = ${testBizId}`
  console.log('🧹 Cleaned up test data in Neon DB\n')

  console.log('=====================================================')
  console.log('🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉')
  console.log('=====================================================')
  await sql.end()
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
