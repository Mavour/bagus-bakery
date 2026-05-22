const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

function validateProduct(body) {
  const name = String(body.name || '').trim();
  const price = Number(body.price_per_box);
  if (!name) throw Object.assign(new Error('Nama produk wajib diisi'), { status: 400 });
  if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error('Harga produk tidak valid'), { status: 400 });
  return { name, price_per_box: Math.round(price) };
}

router.get('/', (_req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all();
  res.json(products);
});

router.post('/', (req, res, next) => {
  try {
    const product = validateProduct(req.body);
    const info = db.prepare('INSERT INTO products (name, price_per_box) VALUES (?, ?)').run(product.name, product.price_per_box);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const product = validateProduct(req.body);
    const info = db.prepare('UPDATE products SET name = ?, price_per_box = ? WHERE id = ?').run(product.name, product.price_per_box, req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Produk tidak ditemukan'), { status: 404 });
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Produk tidak ditemukan'), { status: 404 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
