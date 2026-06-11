const express = require('express');
const { db, serializeSale } = require('../database/db');

const router = express.Router();

const saleSelect = `
  SELECT sales.*,
    COALESCE((
      SELECT SUM(amount)
      FROM sale_payments
      WHERE sale_payments.sale_id = sales.id
    ), 0) AS paid_amount
  FROM sales
`;

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
  const category = body.category === 'ORDER' ? 'ORDER' : 'PENJUALAN';
  const status = body.status === 'paid' ? 'paid' : 'unpaid';
  const items = normalizeItems(body.items);
  const createdAt = normalizeSaleDate(body.created_at);
  const totalAmount = items.reduce((sum, item) => sum + item.qty * item.price_per_box, 0);
  if (!buyerName) throw Object.assign(new Error('Nama pembeli wajib diisi'), { status: 400 });
  return {
    buyer_name: buyerName,
    category,
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
  const rows = db.prepare(`${saleSelect} ORDER BY datetime(created_at) DESC LIMIT ?`).all(limit)
    .map(serializeSale)
    .filter((sale) => !status || sale.status === status);
  res.json(rows);
});

router.post('/', (req, res, next) => {
  try {
    const sale = validateSale(req.body);
    const createSale = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO sales (buyer_name, items, total_amount, category, status, notes, paid_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sale.buyer_name,
        JSON.stringify(sale.items),
        sale.total_amount,
        sale.category,
        sale.status,
        sale.notes || null,
        sale.paid_at,
        sale.created_at
      );
      if (sale.status === 'paid') {
        db.prepare('INSERT INTO sale_payments (sale_id, amount, paid_at) VALUES (?, ?, ?)')
          .run(info.lastInsertRowid, sale.total_amount, sale.paid_at);
      }
      return info.lastInsertRowid;
    });
    const saleId = createSale();
    const created = db.prepare(`${saleSelect} WHERE sales.id = ?`).get(saleId);
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
    const paidAmount = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?')
      .get(req.params.id).total;
    if (sale.total_amount < paidAmount) {
      throw Object.assign(new Error('Total penjualan tidak boleh lebih kecil dari jumlah yang sudah dibayar'), { status: 400 });
    }

    const updateSale = db.transaction(() => {
      if (sale.status === 'paid' && paidAmount < sale.total_amount) {
        db.prepare('INSERT INTO sale_payments (sale_id, amount, paid_at) VALUES (?, ?, ?)')
          .run(req.params.id, sale.total_amount - paidAmount, sale.paid_at);
      }
      const finalPaidAmount = sale.status === 'paid' ? sale.total_amount : paidAmount;
      const finalStatus = finalPaidAmount >= sale.total_amount ? 'paid' : 'unpaid';
      const paidAt = finalStatus === 'paid'
        ? db.prepare('SELECT MAX(paid_at) AS paid_at FROM sale_payments WHERE sale_id = ?').get(req.params.id).paid_at
        : null;
      db.prepare(`
        UPDATE sales
        SET buyer_name = ?, items = ?, total_amount = ?, category = ?, status = ?, notes = ?, paid_at = ?, created_at = ?
        WHERE id = ?
      `).run(
        sale.buyer_name,
        JSON.stringify(sale.items),
        sale.total_amount,
        sale.category,
        finalStatus,
        sale.notes || null,
        paidAt,
        sale.created_at,
        req.params.id
      );
    });
    updateSale();
    res.json(serializeSale(db.prepare(`${saleSelect} WHERE sales.id = ?`).get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/pay', (req, res, next) => {
  try {
    const sale = db.prepare(`${saleSelect} WHERE sales.id = ?`).get(req.params.id);
    if (!sale) throw Object.assign(new Error('Transaksi tidak ditemukan'), { status: 404 });

    const remaining = sale.total_amount - sale.paid_amount;
    const amount = req.body.amount == null ? remaining : Number(req.body.amount);
    const paidAt = normalizeSaleDate(req.body.paid_at || new Date().toISOString().slice(0, 10));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('Nominal pembayaran harus lebih dari 0'), { status: 400 });
    }
    if (amount > remaining) {
      throw Object.assign(new Error('Nominal pembayaran melebihi sisa tagihan'), { status: 400 });
    }

    const recordPayment = db.transaction(() => {
      db.prepare('INSERT INTO sale_payments (sale_id, amount, paid_at) VALUES (?, ?, ?)')
        .run(req.params.id, Math.round(amount), paidAt);
      const isPaid = Math.round(amount) >= remaining;
      db.prepare('UPDATE sales SET status = ?, paid_at = ? WHERE id = ?')
        .run(isPaid ? 'paid' : 'unpaid', isPaid ? paidAt : null, req.params.id);
    });
    recordPayment();
    res.json(serializeSale(db.prepare(`${saleSelect} WHERE sales.id = ?`).get(req.params.id)));
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
