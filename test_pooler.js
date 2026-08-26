const { Pool } = require('pg');

const poolerUrl = 'postgresql://postgres.kfxfjowctulnyhngdizl:7860sahilali@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const pool = new Pool({
  connectionString: poolerUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Testing connection to Supabase Pooler...');
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Connection successful via pooler! Server time:', res.rows[0].now);

    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables found:', tablesRes.rows.map(r => r.table_name));
  } catch (err) {
    console.error('Pooler connection failed:', err.message);
  } finally {
    await pool.end();
  }
}

run();
