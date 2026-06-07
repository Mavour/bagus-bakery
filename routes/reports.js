const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function parseItems(items) {
  try {
    return JSON.parse(items);
  } catch (_error) {
    return [];
  }
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function addMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function getMonthRows(key) {
  return db.prepare(`
    SELECT sales.*,
      COALESCE((
        SELECT SUM(amount)
        FROM sale_payments
        WHERE sale_payments.sale_id = sales.id
      ), 0) AS paid_amount
    FROM sales
    WHERE strftime('%Y-%m', created_at) = ?
    ORDER BY datetime(created_at) DESC
  `).all(key);
}

function getMonthExpenses(key) {
  return db.prepare("SELECT * FROM expenses WHERE strftime('%Y-%m', purchased_at) = ? ORDER BY datetime(purchased_at) DESC, id DESC").all(key);
}

function aggregateExpenses(expenses) {
  const categoryMap = new Map();
  let totalExpenses = 0;

  for (const expense of expenses) {
    totalExpenses += expense.amount;
    const current = categoryMap.get(expense.category) || { category: expense.category, amount: 0, count: 0 };
    current.amount += expense.amount;
    current.count += 1;
    categoryMap.set(expense.category, current);
  }

  return {
    total_expenses: totalExpenses,
    expense_count: expenses.length,
    expenses_by_category: Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount)
  };
}

function aggregateRows(rows, daysInMonth, key) {
  const dailyMap = new Map();
  for (let day = 1; day <= daysInMonth; day += 1) {
    dailyMap.set(`${key}-${String(day).padStart(2, '0')}`, 0);
  }

  const productMap = new Map();
  let totalRevenue = 0;
  let totalUnpaid = 0;
  let totalBoxesSold = 0;

  for (const row of rows) {
    const dateKey = String(row.created_at).slice(0, 10);
    const paidAmount = Number(row.paid_amount || 0);
    totalRevenue += paidAmount;
    totalUnpaid += Math.max(0, row.total_amount - paidAmount);
    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + paidAmount);

    for (const item of parseItems(row.items)) {
      const qty = Number(item.qty || 0);
      const paidRatio = row.total_amount > 0 ? Math.min(1, paidAmount / row.total_amount) : 0;
      const revenue = qty * Number(item.price_per_box || 0) * paidRatio;
      totalBoxesSold += qty;
      const current = productMap.get(item.product_name) || { product_name: item.product_name, boxes: 0, revenue: 0 };
      current.boxes += qty;
      current.revenue += revenue;
      productMap.set(item.product_name, current);
    }
  }

  const revenueByProduct = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => ({
      ...item,
      percentage: totalRevenue > 0 ? Number(((item.revenue / totalRevenue) * 100).toFixed(1)) : 0
    }));

  return {
    total_revenue: totalRevenue,
    total_transactions: rows.length,
    total_unpaid: totalUnpaid,
    total_boxes_sold: totalBoxesSold,
    revenue_by_product: revenueByProduct,
    daily_revenue: Array.from(dailyMap.entries()).map(([date, revenue]) => ({ date, revenue }))
  };
}

function estimateProfit(rows, totalRevenuePaid) {
  const latestCalculations = db.prepare(`
    SELECT pc.*
    FROM profit_calculations pc
    INNER JOIN (
      SELECT product_name, MAX(datetime(created_at)) AS latest
      FROM profit_calculations
      GROUP BY product_name
    ) latest_calc
      ON latest_calc.product_name = pc.product_name
      AND latest_calc.latest = datetime(pc.created_at)
  `).all();

  const costByProduct = new Map(
    latestCalculations.map((calc) => [calc.product_name, calc.total_cost / calc.boxes_produced])
  );

  if (costByProduct.size === 0) {
    return {
      total_revenue_paid: totalRevenuePaid,
      estimated_cogs: 0,
      net_profit: 0,
      margin_percent: 0,
      has_calculation_data: false
    };
  }

  let estimatedCogs = 0;
  for (const row of rows.filter((sale) => Number(sale.paid_amount || 0) > 0)) {
    const paidRatio = Math.min(1, Number(row.paid_amount || 0) / row.total_amount);
    for (const item of parseItems(row.items)) {
      const costPerBox = costByProduct.get(item.product_name);
      if (Number.isFinite(costPerBox)) estimatedCogs += costPerBox * Number(item.qty || 0) * paidRatio;
    }
  }

  const netProfit = totalRevenuePaid - estimatedCogs;
  return {
    total_revenue_paid: totalRevenuePaid,
    estimated_cogs: Math.round(estimatedCogs),
    net_profit: Math.round(netProfit),
    margin_percent: totalRevenuePaid > 0 ? Number(((netProfit / totalRevenuePaid) * 100).toFixed(1)) : 0,
    has_calculation_data: true
  };
}

router.get('/monthly', (req, res) => {
  const now = new Date();
  const year = Number(req.query.year || now.getFullYear());
  const month = Number(req.query.month || now.getMonth() + 1);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Parameter tahun atau bulan tidak valid' });
  }

  const key = monthKey(year, month);
  const rows = getMonthRows(key);
  const expenses = getMonthExpenses(key);
  const daysInMonth = new Date(year, month, 0).getDate();
  const aggregate = aggregateRows(rows, daysInMonth, key);
  const expenseAggregate = aggregateExpenses(expenses);

  const previous = addMonth(year, month, -1);
  const previousRows = getMonthRows(monthKey(previous.year, previous.month));
  const previousExpenses = getMonthExpenses(monthKey(previous.year, previous.month));
  const previousAggregate = aggregateRows(previousRows, new Date(previous.year, previous.month, 0).getDate(), monthKey(previous.year, previous.month));

  const revenueChange = aggregate.total_revenue - previousAggregate.total_revenue;
  const transactionChange = aggregate.total_transactions - previousAggregate.total_transactions;

  res.json({
    period: `${monthNames[month - 1]} ${year}`,
    ...aggregate,
    ...expenseAggregate,
    estimated_profit: estimateProfit(rows, aggregate.total_revenue),
    vs_last_month: {
      last_month_revenue: previousAggregate.total_revenue,
      revenue_change: revenueChange,
      revenue_change_percent: previousAggregate.total_revenue > 0
        ? Number(((revenueChange / previousAggregate.total_revenue) * 100).toFixed(1))
        : aggregate.total_revenue > 0 ? 100 : 0,
      last_month_transactions: previousAggregate.total_transactions,
      transaction_change: transactionChange
    }
  });
});

module.exports = router;
