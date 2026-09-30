const postgres = require('postgres');

const candidates = [
  'postgresql://neondb_owner:npg_YrFUV0NP6bJK@ep-sparkling-salad-b5ijqvzt-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  'postgresql://neondb_owner:npg_7jdtJZIDQOr9@ep-coolb5joojj3-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
];

async function testAll() {
  for (const url of candidates) {
    console.log('\nTesting:', url.split('@')[1]);
    const sql = postgres(url, { connect_timeout: 5 });
    try {
      const res = await sql`SELECT current_database(), current_user, version()`;
      console.log('SUCCESS!', res);
      const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
      console.log('Tables:', tables.map(t => t.table_name));
      const settings = await sql`SELECT * FROM public.store_settings LIMIT 1`;
      console.log('Store settings:', settings);
      return url;
    } catch (err) {
      console.log('Failed:', err.message);
    } finally {
      await sql.end();
    }
  }
}

testAll();
