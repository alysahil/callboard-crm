const { Pool } = require('pg');

const connectionString = 'postgresql://postgres:7860sahilali@db.kfxfjowctulnyhngdizl.supabase.co:5432/postgres';
const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Connecting to Supabase...');
  try {
    console.log('Initializing database schema...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        pin TEXT,
        role TEXT,
        active INTEGER DEFAULT 1,
        createdAt TEXT
      )
    `);
    console.log('- Users table created.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT,
        company TEXT,
        niche TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        status TEXT DEFAULT 'new',
        nextFollowUp TEXT,
        createdAt TEXT
      )
    `);
    console.log('- Contacts table created.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS touches (
        id TEXT PRIMARY KEY,
        contactId TEXT,
        date TEXT,
        channel TEXT,
        outcome TEXT,
        notes TEXT,
        FOREIGN KEY(contactId) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('- Touches table created.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        ts TEXT,
        userName TEXT,
        action TEXT,
        detail TEXT
      )
    `);
    console.log('- Activity Log table created.');

    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\nAll tables in database:', tablesRes.rows.map(r => r.table_name));
    
  } catch (err) {
    console.error('Failed with error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
