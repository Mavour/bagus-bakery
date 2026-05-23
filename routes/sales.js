const express = require('express');
const { db, serializeSale } = require('../database/db');

const router = express.Router();

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('Minimal satu produk harus dipilih'), { status: 400 });
  }

  return items.map((item) => {
    const productName = String(item.product_name || '').trim();
    const qty = Number(item.qty);
    const pricePerBox = Number(item.price_per_box);
    if (!productName) throw Object.assign(new Error('Nama produk pada item wajib diisi'), { status: 400 });
    if (!Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Jumlah kotak harus lebih dari 0'), { status: 400 });
    if (!Number.isFinite(pricePerBox) || pricePerBox < 0) throw Object.assign(new Error('Harga per kotak tidak valid'), { status: 400 });
    return {
      product_name: productName,
      qty: Math.round(qty),
      price_per_box: Math.round(pricePerBox)
    };
  });
}

function normalizeSaleDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10) + ' 00:00:00';
  const raw = String(value).trim();
  const dateOnly = raw.slice(0, 10);
  const date = new Date(dateOnly);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('Tanggal transaksi tidak valid'), { status: 400 });
  }
  return `${dateOnly} 00:00:00`;
}

function validateSale(body) {
  const buyerName = String(body.buyer_name || '').trim();
  const status = body.status === 'paid' ? 'paid' : 'unpaid';
  const items = normalizeItems(body.items);
  const createdAt = normalizeSaleDate(body.created_at);
  const totalAmount = items.reduce((sum, item) => sum + item.qty * item.price_per_box, 0);
  if (!buyerName) throw Object.assign(new Error('Nama pembeli wajib diisi'), { status: 400 });
  return {
    buyer_name: buyerName,
    items,
    total_amount: totalAmount,
    status,
    notes: String(body.notes || '').trim(),
    created_at: createdAt,
    paid_at: status === 'paid' ? createdAt : null
  };
}

router.get('/', (req, res) => {
  const status = req.query.status === 'paid' || req.query.status === 'unpaid' ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const rows = status
    ? db.prepare('SELECT * FROM sales WHERE status = ? ORDER BY datetime(created_at) DESC LIMIT ?').all(status, limit)
    : db.prepare('SELECT * FROM sales ORDER BY datetime(created_at) DESC LIMIT ?').all(limit);
  res.json(rows.map(serializeSale));
});

router.post('/', (req, res, next) => {
  try {
    const sale = validateSale(req.body);
    const info = db.prepare(`
      INSERT INTO sales (buyer_name, items, total_amount, status, notes, paid_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sale.buyer_name,
      JSON.stringify(sale.items),
      sale.total_amount,
      sale.status,
      sale.notes || null,
      sale.paid_at,
      sale.created_at
    );
    const created = db.prepare('SELECT * FROM sales WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializeSale(created));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    if (!existing) throw Object.assign(new Error('Transaksi tidak ditemukan'), { status: 404 });

    const sale = validateSale(req.body);
    const paidAt = sale.status === 'paid' ? sale.paid_at : null;

    db.prepare(`
      UPDATE sales
      SET buyer_name = ?, items = ?, total_amount = ?, status = ?, notes = ?, paid_at = ?, created_at = ?
      WHERE id = ?
    `).run(
      sale.buyer_name,
      JSON.stringify(sale.items),
      sale.total_amount,
      sale.status,
      sale.notes || null,
      paidAt,
      sale.created_at,
      req.params.id
    );
    res.json(serializeSale(db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/pay', (req, res, next) => {
  try {
    const info = db.prepare("UPDATE sales SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Transaksi tidak ditemukan'), { status: 404 });
    res.json(serializeSale(db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Transaksi tidak ditemukan'), { status: 404 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
