const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'callboard.db');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let dbRun, dbGet, dbAll;

if (process.env.DATABASE_URL) {
  console.log('Connecting to PostgreSQL database via DATABASE_URL...');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const translateQuery = (sql) => {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  };

  dbRun = async (sql, params = []) => {
    const pgSql = translateQuery(sql);
    return await pool.query(pgSql, params);
  };

  dbGet = async (sql, params = []) => {
    const pgSql = translateQuery(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
  };

  dbAll = async (sql, params = []) => {
    const pgSql = translateQuery(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  };
} else {
  console.log('Connecting to local SQLite database.');
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Database connection error:', err);
    } else {
      console.log('Connected to the SQLite database.');
    }
  });

  dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize Schema
async function initDb() {
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        pin TEXT,
        role TEXT,
        active INTEGER DEFAULT 1,
        createdAt TEXT
      )
    `);

    await dbRun(`
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

    await dbRun(`
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

    await dbRun(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        ts TEXT,
        userName TEXT,
        action TEXT,
        detail TEXT
      )
    `);
    console.log('Database tables initialized.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  }
}

initDb();

// Middleware to get user details from X-User-ID header
async function getCurrentUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    req.user = null;
    return next();
  }
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    req.user = user || null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}
app.use(getCurrentUser);

// Middleware to restrict to logged in users
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  if (!req.user.active) {
    return res.status(403).json({ error: 'User account is deactivated.' });
  }
  next();
}

// Middleware to restrict to admins
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin role required.' });
  }
  if (!req.user.active) {
    return res.status(403).json({ error: 'User account is deactivated.' });
  }
  next();
}

// Helper to log system activity
async function logActivity(userName, action, detail) {
  const id = 'act_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ts = new Date().toISOString();
  await dbRun(
    'INSERT INTO activity_log (id, ts, userName, action, detail) VALUES (?, ?, ?, ?, ?)',
    [id, ts, userName || 'System', action, detail || '']
  );
}

// --- AUTH API ---

// Session Check
app.get('/api/auth/session', async (req, res) => {
  if (req.user) {
    if (!req.user.active) {
      return res.status(403).json({ error: 'Account deactivated.' });
    }
    return res.json({ user: { id: req.user.id, name: req.user.name, role: req.user.role } });
  }
  res.json({ user: null });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, pin } = req.body;
  const trimmedName = name ? name.trim() : '';

  if (!trimmedName || !pin || pin.length < 4) {
    return res.status(400).json({ error: 'Enter a name and a PIN of at least 4 digits.' });
  }

  try {
    const existing = await dbGet('SELECT * FROM users WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing) {
      return res.status(400).json({ error: 'That name is already registered — log in instead.' });
    }

    // Determine role (first user is admin)
    const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
    const role = userCount.count === 0 ? 'admin' : 'caller';

    const userId = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const createdAt = new Date().toISOString();

    await dbRun(
      'INSERT INTO users (id, name, pin, role, active, createdAt) VALUES (?, ?, ?, ?, 1, ?)',
      [userId, trimmedName, pin, role, createdAt]
    );

    await logActivity(trimmedName, 'Registered account', `Role: ${role}`);

    res.json({ user: { id: userId, name: trimmedName, role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { name, pin } = req.body;
  const trimmedName = name ? name.trim() : '';

  if (!trimmedName || !pin) {
    return res.status(400).json({ error: 'Enter your name and PIN.' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (!user || user.pin !== pin) {
      return res.status(400).json({ error: 'No match for that name and PIN.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'This account has been deactivated. Ask an admin.' });
    }

    await logActivity(user.name, 'Logged in', '');

    res.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to login user.' });
  }
});

// --- CONTACTS API ---

// Get Contacts (Authenticated)
app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await dbAll('SELECT * FROM contacts');
    const touches = await dbAll('SELECT * FROM touches');

    // Attach touches (calls) to corresponding contacts
    const contactsMap = contacts.map(c => {
      c.calls = touches.filter(t => t.contactId === c.id);
      return c;
    });

    res.json(contactsMap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch contacts.' });
  }
});

// Create Contact (Authenticated)
app.post('/api/contacts', requireAuth, async (req, res) => {
  const { name, company, niche, phone, email, address, notes, status, nextFollowUp } = req.body;
  const trimmedName = name ? name.trim() : '';

  if (!trimmedName) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const id = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const createdAt = new Date().toISOString();

  try {
    await dbRun(
      `INSERT INTO contacts (id, name, company, niche, phone, email, address, notes, status, nextFollowUp, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        trimmedName,
        company || '',
        niche || 'Uncategorized',
        phone || '',
        email || '',
        address || '',
        notes || '',
        status || 'new',
        nextFollowUp || null,
        createdAt
      ]
    );

    await logActivity(req.user.name, 'Created contact', trimmedName);

    // Fetch the new contact to return
    const newContact = await dbGet('SELECT * FROM contacts WHERE id = ?', [id]);
    newContact.calls = [];

    res.json(newContact);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create contact.' });
  }
});

// Update Contact (Authenticated)
app.put('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, company, niche, phone, email, address, notes, status, nextFollowUp } = req.body;

  try {
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [id]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    await dbRun(
      `UPDATE contacts
       SET name = ?, company = ?, niche = ?, phone = ?, email = ?, address = ?, notes = ?, status = ?, nextFollowUp = ?
       WHERE id = ?`,
      [
        name || contact.name,
        company !== undefined ? company : contact.company,
        niche !== undefined ? niche : contact.niche,
        phone !== undefined ? phone : contact.phone,
        email !== undefined ? email : contact.email,
        address !== undefined ? address : contact.address,
        notes !== undefined ? notes : contact.notes,
        status || contact.status,
        nextFollowUp !== undefined ? nextFollowUp : contact.nextFollowUp,
        id
      ]
    );

    await logActivity(req.user.name, 'Updated contact', name || contact.name);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update contact.' });
  }
});

// Delete Contact (Authenticated)
app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [id]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    await dbRun('DELETE FROM contacts WHERE id = ?', [id]);
    await dbRun('DELETE FROM touches WHERE contactId = ?', [id]);

    await logActivity(req.user.name, 'Deleted contact', contact.name);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete contact.' });
  }
});

// Bulk Import Contacts (Authenticated)
app.post('/api/contacts/import', requireAuth, async (req, res) => {
  const { contacts } = req.body;

  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Invalid contacts format.' });
  }

  try {
    db.serialize(async () => {
      const stmt = db.prepare(
        `INSERT INTO contacts (id, name, company, niche, phone, email, address, notes, status, nextFollowUp, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      contacts.forEach(c => {
        const id = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        const createdAt = new Date().toISOString();
        stmt.run([
          id,
          (c.name || 'Unnamed').trim(),
          c.company || '',
          c.niche || 'Uncategorized',
          c.phone || '',
          c.email || '',
          c.address || '',
          c.notes || '',
          c.status || 'new',
          c.nextFollowUp || null,
          createdAt
        ]);
      });

      stmt.finalize();

      await logActivity(req.user.name, 'Imported contacts', `${contacts.length} contacts`);
      res.json({ success: true, count: contacts.length });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import contacts.' });
  }
});

// --- TOUCHES (CALLS) API ---

// Log Touch (Authenticated)
app.post('/api/contacts/:id/touches', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { channel, outcome, notes } = req.body;

  try {
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [id]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    const touchId = 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const date = new Date().toISOString();

    await dbRun(
      'INSERT INTO touches (id, contactId, date, channel, outcome, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [touchId, id, date, channel, outcome, notes || '']
    );

    // Smart status bump
    let newStatus = contact.status;
    const map = {
      'Connected': 'connected',
      'Interested': 'interested',
      'Not Interested': 'not_interested',
      'Do Not Call': 'do_not_call',
      'Replied': 'connected',
      'Message Replied': 'connected'
    };
    if (map[outcome]) {
      newStatus = map[outcome];
    } else if (contact.status === 'new') {
      newStatus = 'attempted';
    }

    if (newStatus !== contact.status) {
      await dbRun('UPDATE contacts SET status = ? WHERE id = ?', [newStatus, id]);
    }

    await logActivity(req.user.name, `Logged ${channel}`, `${contact.name} — ${outcome}`);

    res.json({ success: true, newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log touch.' });
  }
});

// --- ADMIN API (Admin Only) ---

// Get Users list
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT id, name, role, active, createdAt FROM users');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// Update User details
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role, active, pin } = req.body;

  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own administrative details.' });
    }

    const updates = [];
    const params = [];

    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (active !== undefined) {
      updates.push('active = ?');
      params.push(active ? 1 : 0);
    }
    if (pin !== undefined && pin.trim().length >= 4) {
      updates.push('pin = ?');
      params.push(pin.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update parameters provided.' });
    }

    params.push(id);
    await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    await logActivity(req.user.name, 'Admin modified user', `${user.name}`);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// Get System Activity Log
app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM activity_log ORDER BY ts DESC LIMIT 300');
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
});

// General Client Logger
app.post('/api/activity', requireAuth, async (req, res) => {
  const { action, detail } = req.body;
  try {
    await logActivity(req.user.name, action, detail);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log activity.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
