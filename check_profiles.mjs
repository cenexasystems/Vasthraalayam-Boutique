import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_7jdtJZIDQOr9@ep-cool-mountain-b5joojj3-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const constraints = await sql`
    SELECT conname, contype, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'printer_profiles';
  `;
  console.log('Constraints on printer_profiles:', constraints);

  const profiles = await sql`
    SELECT id, business_id, name, is_default, printer_type, size_id
    FROM public.printer_profiles;
  `;
  console.log('Profiles in DB:', profiles);

  await sql.end();
}

main().catch(console.error);
