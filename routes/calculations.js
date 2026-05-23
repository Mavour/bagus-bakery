const express = require('express');
const { db, serializeCalculation } = require('../database/db');

const router = express.Router();

function validateCalculation(body) {
  const productName = String(body.product_name || '').trim();
  const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const extraCosts = Number(body.extra_costs || 0);
  const boxesProduced = Number(body.boxes_produced);
  const sellingPricePerBox = Number(body.selling_price_per_box);

  if (!productName) throw Object.assign(new Error('Produk wajib dipilih'), { status: 400 });
  if (ingredients.length === 0) throw Object.assign(new Error('Minimal satu bahan harus diisi'), { status: 400 });
  if (!Number.isFinite(extraCosts) || extraCosts < 0) throw Object.assign(new Error('Biaya tambahan tidak valid'), { status: 400 });
  if (!Number.isFinite(boxesProduced) || boxesProduced <= 0) throw Object.assign(new Error('Jumlah kotak harus lebih dari 0'), { status: 400 });
  if (!Number.isFinite(sellingPricePerBox) || sellingPricePerBox < 0) throw Object.assign(new Error('Harga jual tidak valid'), { status: 400 });

  const normalizedIngredients = ingredients.map((item) => {
    const name = String(item.name || '').trim();
    const quantity = String(item.quantity || '').trim();
    const price = Number(item.price);
    if (!name) throw Object.assign(new Error('Nama bahan wajib diisi'), { status: 400 });
    if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error('Harga bahan tidak valid'), { status: 400 });
    return { name, quantity, price: Math.round(price) };
  });

  const totalCost = normalizedIngredients.reduce((sum, item) => sum + item.price, 0) + Math.round(extraCosts);
  const costPerBox = totalCost / boxesProduced;
  const profitPerBox = Math.round(sellingPricePerBox - costPerBox);
  const revenue = sellingPricePerBox * boxesProduced;
  const profitPerBatch = Math.round(revenue - totalCost);
  const marginPercent = revenue > 0 ? Number(((profitPerBatch / revenue) * 100).toFixed(1)) : 0;

  return {
    product_name: productName,
    ingredients: normalizedIngredients,
    extra_costs: Math.round(extraCosts),
    total_cost: Math.round(totalCost),
    boxes_produced: Math.round(boxesProduced),
    selling_price_per_box: Math.round(sellingPricePerBox),
    profit_per_box: profitPerBox,
    profit_per_batch: profitPerBatch,
    margin_percent: marginPercent
  };
}

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM profit_calculations ORDER BY datetime(created_at) DESC').all();
  res.json(rows.map(serializeCalculation));
});

router.post('/', (req, res, next) => {
  try {
    const calculation = validateCalculation(req.body);
    const info = db.prepare(`
      INSERT INTO profit_calculations (
        product_name, ingredients, extra_costs, total_cost, boxes_produced,
        selling_price_per_box, profit_per_box, profit_per_batch, margin_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      calculation.product_name,
      JSON.stringify(calculation.ingredients),
      calculation.extra_costs,
      calculation.total_cost,
      calculation.boxes_produced,
      calculation.selling_price_per_box,
      calculation.profit_per_box,
      calculation.profit_per_batch,
      calculation.margin_percent
    );
    res.status(201).json(serializeCalculation(db.prepare('SELECT * FROM profit_calculations WHERE id = ?').get(info.lastInsertRowid)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const calculation = validateCalculation(req.body);
    const info = db.prepare(`
      UPDATE profit_calculations
      SET product_name = ?, ingredients = ?, extra_costs = ?, total_cost = ?, boxes_produced = ?,
          selling_price_per_box = ?, profit_per_box = ?, profit_per_batch = ?, margin_percent = ?
      WHERE id = ?
    `).run(
      calculation.product_name,
      JSON.stringify(calculation.ingredients),
      calculation.extra_costs,
      calculation.total_cost,
      calculation.boxes_produced,
      calculation.selling_price_per_box,
      calculation.profit_per_box,
      calculation.profit_per_batch,
      calculation.margin_percent,
      req.params.id
    );
    if (info.changes === 0) throw Object.assign(new Error('Kalkulasi tidak ditemukan'), { status: 404 });
    res.json(serializeCalculation(db.prepare('SELECT * FROM profit_calculations WHERE id = ?').get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM profit_calculations WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw Object.assign(new Error('Kalkulasi tidak ditemukan'), { status: 404 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
