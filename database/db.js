const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const databaseDir = __dirname;
const databasePath = path.join(databaseDir, 'bagus-bakery.sqlite');

if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price_per_box INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_name TEXT NOT NULL,
      items TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'PENJUALAN',
      status TEXT DEFAULT 'unpaid',
      notes TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profit_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      ingredients TEXT NOT NULL,
      extra_costs INTEGER DEFAULT 0,
      total_cost INTEGER NOT NULL,
      boxes_produced INTEGER NOT NULL,
      selling_price_per_box INTEGER NOT NULL,
      profit_per_box INTEGER NOT NULL,
      profit_per_batch INTEGER NOT NULL,
      margin_percent REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity TEXT,
      amount INTEGER NOT NULL,
      shop_name TEXT,
      notes TEXT,
      purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const saleColumns = db.prepare('PRAGMA table_info(sales)').all();
  if (!saleColumns.some((column) => column.name === 'category')) {
    db.exec("ALTER TABLE sales ADD COLUMN category TEXT NOT NULL DEFAULT 'PENJUALAN'");
  }

  db.exec(`
    INSERT INTO sale_payments (sale_id, amount, paid_at)
    SELECT id, total_amount, COALESCE(paid_at, created_at)
    FROM sales
    WHERE status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM sale_payments WHERE sale_payments.sale_id = sales.id
      );
  `);

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (productCount === 0) {
    const insert = db.prepare('INSERT INTO products (name, price_per_box) VALUES (?, ?)');
    const seedProducts = [
      ['Nastar', 85000],
      ['Kastangel', 90000],
      ['Cookies Susu', 75000],
      ['Cookies Coklat', 75000]
    ];
    const seed = db.transaction(() => seedProducts.forEach((product) => insert.run(...product)));
    seed();
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function serializeSale(row) {
  const paidAmount = Number(row.paid_amount || 0);
  const totalAmount = Number(row.total_amount || 0);
  return {
    ...row,
    items: parseJson(row.items, []),
    paid_amount: paidAmount,
    remaining_amount: Math.max(0, totalAmount - paidAmount),
    status: paidAmount >= totalAmount ? 'paid' : 'unpaid'
  };
}

function serializeCalculation(row) {
  return {
    ...row,
    ingredients: parseJson(row.ingredients, [])
  };
}

module.exports = {
  db,
  initDatabase,
  serializeSale,
  serializeCalculation
};
