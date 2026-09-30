const postgres = require('postgres');

async function test(url) {
  try {
    const sql = postgres(url, { connect_timeout: 4 });
    const r = await sql`SELECT 1 as connected`;
    console.log('Connected successfully to:', url);
    await sql.end();
    return true;
  } catch (e) {
    console.log('Failed:', url.split('@')[1], e.message);
    return false;
  }
}

async function run() {
  await test('postgresql://neondb_owner:npg_7jdtJZIDQOr9@ep-coolb5joojj3-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  await test('postgresql://neondb_owner:npg_7jdtJZIDQOr9@ep-coolb5joojj3.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  await test('postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require');
}
run();
