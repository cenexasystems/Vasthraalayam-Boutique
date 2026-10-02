import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('=== 1. ALL TABLES ===');
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  const tableNames = tables.map(t => t.table_name);
  console.log(tableNames);

  console.log('\n=== 2. SOFT DELETE / STATUS / ACTIVE COLUMNS ===');
  const cols = await sql`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND (
        column_name ILIKE '%delete%' 
        OR column_name ILIKE '%archive%' 
        OR column_name ILIKE '%status%' 
        OR column_name ILIKE '%active%'
        OR column_name ILIKE '%hidden%'
      )
    ORDER BY table_name, column_name;
  `;
  console.table(cols);

  console.log('\n=== 3. FOREIGN KEYS AND ON DELETE RULES ===');
  const fks = await sql`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column,
      rc.delete_rule,
      rc.update_rule,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  `;
  console.table(fks);

  console.log('\n=== 4. ROW COUNTS & SOFT-DELETED COUNTS ===');
  for (const t of tableNames) {
    try {
      const allRows = await sql`SELECT count(*)::int as count FROM ${sql(t)}`;
      const colList = cols.filter(c => c.table_name === t).map(c => c.column_name);
      
      let softCounts = {};
      for (const col of colList) {
        if (col.includes('delete')) {
          const res = await sql`SELECT count(*)::int as count FROM ${sql(t)} WHERE ${sql(col)} IS NOT NULL AND ${sql(col)} != false`;
          softCounts[col + '_truthy'] = res[0].count;
        }
        if (col.includes('status')) {
          const res = await sql`SELECT ${sql(col)} as status_val, count(*)::int as count FROM ${sql(t)} GROUP BY ${sql(col)}`;
          softCounts[col + '_values'] = res.map(r => `${r.status_val}:${r.count}`).join(', ');
        }
      }
      console.log(`Table: ${t.padEnd(25)} Total: ${allRows[0].count.toString().padEnd(6)} Soft/Status info:`, JSON.stringify(softCounts));
    } catch (e) {
      console.log(`Table: ${t.padEnd(25)} Error reading:`, e.message);
    }
  }

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
