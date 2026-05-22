const express = require('express');
const path = require('path');
const { initDatabase } = require('./database/db');

const productsRouter = require('./routes/products');
const salesRouter = require('./routes/sales');
const calculationsRouter = require('./routes/calculations');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');

const app = express();
const port = Number(process.env.PORT || 8080);

initDatabase();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/calculations', calculationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'bagus-bakery' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Terjadi kesalahan server'
  });
});

app.listen(port, () => {
  console.log(`Bagus Bakery running on http://localhost:${port}`);
});
