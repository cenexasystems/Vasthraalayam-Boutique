const postgres = require('postgres');

async function test(name, url) {
  console.log(`\n=== Testing ${name} ===`);
  const sql = postgres(url);
  try {
    const fns = await sql`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
    `;
    console.log('Functions:', fns.map(f => f.routine_name));
  } catch (err) {
    console.error(err.message);
  } finally {
    await sql.end();
  }
}

async function main() {
  await test('ep-crimson-frog', 'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require');
  await test('ep-sparkling-salad', 'postgresql://neondb_owner:npg_YrFUV0NP6bJK@ep-sparkling-salad-b5ijqvzt-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
}

main();
