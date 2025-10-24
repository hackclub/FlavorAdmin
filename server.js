require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    release();
  }
});


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
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    
    res.json({
      success: true,
      columns: result.rows
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


app.get('/workadventure/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM messages 
       ORDER BY created_at DESC`
    );
    
    const messages = result.rows.map(row => ({
      timestamp: row.created_at || row.timestamp || new Date().toISOString(),
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
    res.status(500).json({
      error: 'Failed to fetch messages',
      details: error.message
    });
  }
});


app.delete('/workadventure/messages', async (req, res) => {
  try {
    await pool.query('DELETE FROM messages');
    res.json({ success: true, message: 'All messages cleared' });
  } catch (error) {
    console.error('Error clearing messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear messages',
      details: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Database pool has ended');
    process.exit(0);
  });
});
