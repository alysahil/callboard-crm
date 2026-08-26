const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'callboard.db');
const db = new sqlite3.Database(dbPath);

function queryAll(sql, label) {
  return new Promise((resolve) => {
    db.all(sql, [], (err, rows) => {
      console.log(`\n=== ${label} ===`);
      if (err) {
        console.error(err.message);
      } else if (rows.length === 0) {
        console.log('(Empty)');
      } else {
        console.table(rows);
      }
      resolve();
    });
  });
}

async function dump() {
  await queryAll('SELECT id, name, role, active, createdAt FROM users', 'USERS');
  await queryAll('SELECT id, name, company, niche, phone, status, nextFollowUp FROM contacts', 'CONTACTS');
  await queryAll('SELECT id, contactId, date, channel, outcome, notes FROM touches', 'TOUCH HISTORY');
  await queryAll('SELECT id, ts, userName, action, detail FROM activity_log LIMIT 10', 'RECENT ACTIVITY LOG');
  db.close();
}

dump();
