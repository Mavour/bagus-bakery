const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

const allowedCategories = new Set(['Bahan', 'Kemasan', 'Operasional', 'Lainnya']);

function validateExpense(body) {
  const name = String(body.name || '').trim();
  const category = allowedCategories.has(body.category) ? body.category : 'Bahan';
  const quantity = String(body.quantity || '').trim();
  const amount = Number(body.amount);
  const shopName = String(body.shop_name || '').trim();
  const notes = String(body.notes || '').trim();
  const purchasedAt = body.purchased_at ? new Date(body.purchased_at) : new Date();

  if (!name) throw Object.assign(new Error('Nama bahan wajib diisi'), { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error('Nominal belanja tidak valid'), { status: 400 });
  if (Number.isNaN(purchasedAt.getTime())) throw Object.assign(new Error('Tanggal belanja tidak valid'), { status: 400 });

  return {
    name,
    category,
    quantity,
    amount: Math.round(amount),
    shop_name: shopName,
    notes,
    purchased_at: purchasedAt.toISOString().slice(0, 19).replace('T', ' ')
  };
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 500), 1000);
  const rows = db.prepare('SELECT * FROM expenses ORDER BY datetime(purchased_at) DESC, id DESC LIMIT ?').all(limit);
  res.json(rows);
});

router.post('/', (req, res, next) => {
  try {
    const expense = validateExpense(req.body);
    const info = db.prepare(`
      INSERT INTO expenses (name, category, quantity, amount, shop_name, notes, purchased_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      expense.name,
      expense.category,
      expense.quantity || null,
      expense.amount,
      expense.shop_name || null,
      expense.notes || null,
      expense.purchased_at
    );
    res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const expense = validateExpense(req.body);
    const info = db.prepare(`
      UPDATE expenses
      SET name = ?, category = ?, quantity = ?, amount = ?, shop_name = ?, notes = ?, purchased_at = ?
      WHERE id = ?
    `).run(
      expense.name,
      expense.category,
      expense.quantity || null,
      expense.amount,
      expense.shop_name || null,
      expense.notes || null,
      expense.purchased_at,
      req.params.id
    );
    if (info.changes === 0) throw Object.assign(new Error('Catatan belanja tidak ditemukan'), { status: 404 });
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Catatan belanja tidak ditemukan'), { status: 404 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
