require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Config: allow overriding schema/table and SSL via env
const RAW_TABLE = process.env.MESSAGES_TABLE || 'messages';
const RAW_SCHEMA = process.env.DB_SCHEMA || 'public';
function sanitizeIdent(s) {
  return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : null;
}
const TABLE_NAME = sanitizeIdent(RAW_TABLE) || 'messages';
const SCHEMA_NAME = sanitizeIdent(RAW_SCHEMA) || 'public';
function qIdent(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// connection pool
// In dev use public url
// In prod use each var
// reminder to set up a cloned db 
const poolConfig = process.env.DB_PUBLIC_URL
  ? {
      connectionString: process.env.DB_PUBLIC_URL,
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
  
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    };

const pool = new Pool(poolConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
  } else {
    console.log('Successfully connected to db');
    release();
  }
});

async function getTableColumns() {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position`;
  const result = await pool.query(sql, [SCHEMA_NAME, TABLE_NAME]);
  return result.rows.map(r => r.column_name);
}

function pickTimestampColumn(columns) {
  const preferred = ['created_at', 'timestamp', 'createdat', 'inserted_at', 'created', 'time', 'date'];
  const lower = new Set(columns.map(c => c.toLowerCase()));
  return preferred.find(c => lower.has(c)) || null;
}


app.get('/api/messages', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM messages 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      messages: result.rows
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      details: error.message
    });
  }
});

app.get('/api/messages/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM messages');
    res.json({
      success: true,
      count: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error counting messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to count messages',
      details: error.message
    });
  }
});

app.get('/api/schema', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [SCHEMA_NAME, TABLE_NAME]);
    
    res.json({
      success: true,
      schema: SCHEMA_NAME,
      table: TABLE_NAME,
      columns: result.rows,
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schema',
      details: error.message
    });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM users 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      details: error.message
    });
  }
});

app.get('/api/users/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    res.json({
      success: true,
      count: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error counting users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to count users',
      details: error.message
    });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
      details: error.message
    });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin, is_banned, has_unlocked_pets } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (typeof is_admin === 'boolean') {
      updates.push(`is_admin = $${paramCount++}`);
      values.push(is_admin);
    }
    if (typeof is_banned === 'boolean') {
      updates.push(`is_banned = $${paramCount++}`);
      values.push(is_banned);
    }
    if (typeof has_unlocked_pets === 'boolean') {
      updates.push(`has_unlocked_pets = $${paramCount++}`);
      values.push(has_unlocked_pets);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
      details: error.message
    });
  }
});


app.get('/workadventure/messages', async (req, res) => {
  try {
    // Determine available columns and pick an order-by column if present
    const columns = await getTableColumns();
    const orderCol = pickTimestampColumn(columns);
    let sql = `SELECT * FROM ${qIdent(SCHEMA_NAME)}.${qIdent(TABLE_NAME)}`;
    if (orderCol) sql += ` ORDER BY ${qIdent(orderCol)} DESC`;
    const result = await pool.query(sql);
    
    const messages = result.rows.map(row => ({
      timestamp: row.created_at || row.timestamp || row.created || row.inserted_at || row.time || row.date || new Date().toISOString(),
      rawData: {
        type: row.type || 'chat',
        author: row.author || row.user_id || row.username || 'Unknown',
        message: row.message || row.content || row.text || '',
        playerName: row.player_name || row.author || row.username || null,
        roomId: row.room_id || null,
        authorId: row.author_id || row.user_id || null,
        ...row
      }
    }));
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    const code = error && error.code ? String(error.code) : undefined;
    // Helpful hints for common DB errors
    if (code === '42P01' || /does not exist/i.test(error.message || '')) {
      return res.status(500).json({
        error: 'table_not_found',
        details: `Table ${SCHEMA_NAME}.${TABLE_NAME} not found`,
        hint: 'Set MESSAGES_TABLE and DB_SCHEMA env vars to match your database, or create the table.',
      });
    }
    if (code === '3D000') {
      return res.status(500).json({
        error: 'database_not_found',
        details: `Database ${process.env.DB_NAME} does not exist or is not accessible`,
        hint: 'Verify DB_NAME in your environment variables.',
      });
    }
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message, code });
  }
});


// Read-only mode: Do not allow destructive operations
app.delete('/workadventure/messages', async (req, res) => {
  return res.status(405).json({
    success: false,
    error: 'read_only',
    message: 'Deleting messages is disabled. Data is sourced from the database only.'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Lightweight health/diagnostics
app.get('/healthz', async (req, res) => {
  try {
    const ping = await pool.query('SELECT 1 as ok');
    const tableExists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [SCHEMA_NAME, TABLE_NAME]
    );
    res.json({
      ok: true,
      db: ping.rows[0].ok === 1,
      schema: SCHEMA_NAME,
      table: TABLE_NAME,
      tableExists: tableExists.rowCount > 0
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Database pool has ended');
    process.exit(0);
  });
});
