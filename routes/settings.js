const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
});

router.get('/export/all', (_req, res) => {
  const data = {
    products: db.prepare('SELECT * FROM products ORDER BY name').all(),
    sales: db.prepare('SELECT * FROM sales ORDER BY datetime(created_at) DESC').all(),
    calculations: db.prepare('SELECT * FROM profit_calculations ORDER BY datetime(created_at) DESC').all(),
    settings: db.prepare('SELECT * FROM settings ORDER BY key').all(),
    exported_at: new Date().toISOString()
  };
  res.setHeader('Content-Disposition', 'attachment; filename="bagus-bakery-data.json"');
  res.json(data);
});

router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Pengaturan tidak ditemukan' });
  return res.json(row);
});

router.put('/:key', (req, res, next) => {
  try {
    const value = typeof req.body.value === 'string' ? req.body.value : JSON.stringify(req.body.value);
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(req.params.key, value);
    res.json({ key: req.params.key, value });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-data', (req, res, next) => {
  try {
    if (req.body.confirmation !== 'HAPUS') {
      throw Object.assign(new Error('Ketik HAPUS untuk menghapus data'), { status: 400 });
    }
    const reset = db.transaction(() => {
      db.prepare('DELETE FROM sales').run();
      db.prepare('DELETE FROM profit_calculations').run();
    });
    reset();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
