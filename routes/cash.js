const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

const cashTypes = new Set(['in', 'out']);
const sourceLabels = {
  capital: 'Modal',
  manual_in: 'Dana Masuk',
  manual_out: 'Dana Keluar',
  adjustment: 'Koreksi Kas'
};

function formatDateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function validateCashTransaction(body) {
  const transactionDate = formatDateOnly(body.transaction_date);
  const type = cashTypes.has(body.type) ? body.type : 'in';
  const category = sourceLabels[body.category] ? body.category : (type === 'in' ? 'manual_in' : 'manual_out');
  const description = String(body.description || '').trim();
  const amount = Number(body.amount);
  const notes = String(body.notes || '').trim();

  if (!transactionDate) throw Object.assign(new Error('Tanggal kas tidak valid'), { status: 400 });
  if (!description) throw Object.assign(new Error('Keterangan kas wajib diisi'), { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Nominal kas harus lebih dari 0'), { status: 400 });

  return {
    transaction_date: transactionDate,
    type,
    category,
    description,
    amount: Math.round(amount),
    notes
  };
}

function manualRow(row) {
  return {
    id: `cash-${row.id}`,
    raw_id: row.id,
    source: 'cash',
    date: row.transaction_date,
    type: row.type,
    category: row.category,
    category_label: sourceLabels[row.category] || row.category,
    description: row.description,
    amount: row.amount,
    notes: row.notes,
    editable: true
  };
}

function saleRow(row) {
  return {
    id: `sale-${row.id}`,
    raw_id: row.id,
    source: 'sale',
    date: row.paid_at || row.created_at,
    type: 'in',
    category: 'sale',
    category_label: 'Penjualan Lunas',
    description: `Penjualan - ${row.buyer_name}`,
    amount: row.total_amount,
    notes: row.notes,
    editable: false
  };
}

function expenseRow(row) {
  return {
    id: `expense-${row.id}`,
    raw_id: row.id,
    source: 'expense',
    date: row.purchased_at,
    type: 'out',
    category: 'expense',
    category_label: row.category,
    description: row.name,
    amount: row.amount,
    notes: row.notes,
    editable: false
  };
}

function loadEntries(limit) {
  const manual = db.prepare('SELECT * FROM cash_transactions ORDER BY datetime(transaction_date) DESC, id DESC LIMIT ?').all(limit).map(manualRow);
  const sales = db.prepare("SELECT * FROM sales WHERE status = 'paid' ORDER BY datetime(COALESCE(paid_at, created_at)) DESC LIMIT ?").all(limit).map(saleRow);
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY datetime(purchased_at) DESC, id DESC LIMIT ?').all(limit).map(expenseRow);

  return [...manual, ...sales, ...expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 500), 1000);
  const entries = loadEntries(limit);
  const manualIn = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_transactions WHERE type = 'in'").get().total;
  const manualOut = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_transactions WHERE type = 'out'").get().total;
  const salesIn = db.prepare("SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE status = 'paid'").get().total;
  const expensesOut = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses').get().total;
  const summary = {
    total_in: manualIn + salesIn,
    total_out: manualOut + expensesOut,
    balance: manualIn + salesIn - manualOut - expensesOut
  };

  res.json({ summary, entries });
});

router.post('/', (req, res, next) => {
  try {
    const tx = validateCashTransaction(req.body);
    const info = db.prepare(`
      INSERT INTO cash_transactions (transaction_date, type, category, description, amount, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tx.transaction_date, tx.type, tx.category, tx.description, tx.amount, tx.notes || null);
    res.status(201).json(manualRow(db.prepare('SELECT * FROM cash_transactions WHERE id = ?').get(info.lastInsertRowid)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const tx = validateCashTransaction(req.body);
    const info = db.prepare(`
      UPDATE cash_transactions
      SET transaction_date = ?, type = ?, category = ?, description = ?, amount = ?, notes = ?
      WHERE id = ?
    `).run(tx.transaction_date, tx.type, tx.category, tx.description, tx.amount, tx.notes || null, req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Catatan kas tidak ditemukan'), { status: 404 });
    res.json(manualRow(db.prepare('SELECT * FROM cash_transactions WHERE id = ?').get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM cash_transactions WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Catatan kas tidak ditemukan'), { status: 404 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
