const app = document.getElementById('app');
const bottomNav = document.getElementById('bottom-nav');
const sidebarNav = document.getElementById('sidebar-nav');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const toastWrap = document.getElementById('toast-wrap');

const defaultNavLabels = ['Dashboard', 'Tagihan', 'Belanja', 'Kas', 'Kalkulator', 'Laporan'];
const icons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z"/></svg>',
  bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Zm3 5h7M10 12h7M10 16h4"/></svg>',
  expense: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h15l-2 11H7L5 4H2M9 11h8M10 15h6M9 21a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1ZM18 21a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/></svg>',
  cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3V7Zm3 3h.01M18 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>',
  calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 4h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
  report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h14M9 16v-5M13 16V8M17 16v-8"/></svg>'
};
const navItems = [
  { hash: '#dashboard', icon: icons.home },
  { hash: '#tagihan', icon: icons.bill },
  { hash: '#belanja', icon: icons.expense },
  { hash: '#kas', icon: icons.cash },
  { hash: '#kalkulator', icon: icons.calc },
  { hash: '#laporan', icon: icons.report }
];

const state = {
  products: [],
  sales: [],
  expenses: [],
  cash: { summary: { total_in: 0, total_out: 0, balance: 0 }, entries: [] },
  calculations: [],
  settings: {},
  navLabels: [...defaultNavLabels],
  charts: {}
};

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

function formatCurrency(value) {
  return rupiah.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '-';
  return dateFormatter.format(new Date(value));
}

function paidAmount(sale) {
  return Number(sale?.paid_amount || 0);
}

function remainingAmount(sale) {
  return Math.max(0, Number(sale?.total_amount || 0) - paidAmount(sale));
}

function paymentStatus(sale) {
  if (remainingAmount(sale) === 0) return { label: 'Lunas', badge: 'success', invoiceClass: 'paid' };
  if (paidAmount(sale) > 0) return { label: 'Sebagian', badge: '', invoiceClass: 'partial' };
  return { label: 'Belum', badge: 'danger', invoiceClass: 'unpaid' };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(value) {
  const then = new Date(value);
  const now = new Date();
  return Math.max(0, Math.floor((now - then) / 86400000));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data.error || 'Permintaan gagal');
  }
  return data;
}

function showToast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;
  toastWrap.appendChild(item);
  setTimeout(() => item.remove(), 3600);
}

function openModal(title, content) {
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modalBackdrop.hidden = false;
}

function closeModal() {
  modalBackdrop.hidden = true;
  modalBody.innerHTML = '';
}

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeModal();
});

function itemSummary(items) {
  return items.map((item) => `${escapeHtml(item.product_name)} ${item.qty} kotak`).join(', ');
}

function renderShell() {
  const current = window.location.hash || '#dashboard';
  const links = navItems.map((item, index) => {
    const active = current === item.hash ? 'active' : '';
    const label = state.navLabels[index] || defaultNavLabels[index];
    return `
      <a href="${item.hash}" class="${active}" aria-label="${escapeHtml(label)}">
        <span class="nav-icon">${item.icon}</span>
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  }).join('');
  bottomNav.innerHTML = links;
  sidebarNav.innerHTML = links;
}

function renderLoading(title = 'Memuat data') {
  app.innerHTML = `
    <h1 class="page-title">${title}</h1>
    <p class="page-subtitle">Sebentar, data sedang disiapkan.</p>
    <div class="grid stats-grid">
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </div>
  `;
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function createChart(id, canvasId, config) {
  destroyChart(id);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  state.charts[id] = new Chart(canvas, config);
}

async function refreshCommon() {
  const [products, sales, expenses, cash, calculations, settings] = await Promise.all([
    api('/api/products'),
    api('/api/sales?limit=500'),
    api('/api/expenses?limit=500'),
    api('/api/cash?limit=500'),
    api('/api/calculations'),
    api('/api/settings')
  ]);
  state.products = products;
  state.sales = sales;
  state.expenses = expenses;
  state.cash = cash;
  state.calculations = calculations;
  state.settings = settings;
  try {
    const parsed = JSON.parse(settings.nav_labels || 'null');
    state.navLabels = Array.isArray(parsed) && parsed.length === navItems.length ? parsed : [...defaultNavLabels];
  } catch (_error) {
    state.navLabels = [...defaultNavLabels];
  }
}

function dashboardStats() {
  const today = localDateKey();
  const thisMonth = monthKey();
  const todaysSales = state.sales.filter((sale) => String(sale.created_at).startsWith(today));
  const monthSales = state.sales.filter((sale) => String(sale.created_at).startsWith(thisMonth));
  const monthExpenses = state.expenses.filter((expense) => String(expense.purchased_at).startsWith(thisMonth));
  const monthExpensesTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    todayRevenue: todaysSales.reduce((sum, sale) => sum + paidAmount(sale), 0),
    monthRevenue: monthSales.reduce((sum, sale) => sum + paidAmount(sale), 0),
    monthExpensesTotal,
    todayTransactions: todaysSales.length,
    unpaidTotal: state.sales.reduce((sum, sale) => sum + remainingAmount(sale), 0)
  };
}

function weeklyRevenue() {
  const labels = [];
  const values = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = localDateKey(date);
    labels.push(new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric' }).format(date));
    values.push(state.sales
      .filter((sale) => String(sale.created_at).startsWith(key))
      .reduce((sum, sale) => sum + paidAmount(sale), 0));
  }
  return { labels, values };
}

function renderDashboard() {
  const stats = dashboardStats();
  const recentSales = state.sales.slice(0, 5);
  app.innerHTML = `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-subtitle">Ringkasan penjualan, bon, dan transaksi terbaru.</p>

    <div class="grid stats-grid">
      ${statCard('Penjualan hari ini', formatCurrency(stats.todayRevenue))}
      ${statCard('Penjualan bulan ini', formatCurrency(stats.monthRevenue))}
      ${statCard('Persediaan masuk', formatCurrency(stats.monthExpensesTotal), stats.monthExpensesTotal > 0)}
      ${statCard('Transaksi hari ini', `${stats.todayTransactions}`)}
      ${statCard('Bon belum dibayar', formatCurrency(stats.unpaidTotal), stats.unpaidTotal > 0)}
    </div>

    <div class="section">
      <button class="btn" type="button" data-action="new-sale">+ Catat Penjualan Baru</button>
    </div>

    <section class="section card panel chart-panel">
      <div class="section-header">
        <h2>Penjualan 7 Hari</h2>
      </div>
      <div class="chart-wrap"><canvas id="weekly-chart"></canvas></div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Transaksi Terbaru</h2>
      </div>
      ${searchControl('dashboard-search', 'Cari transaksi terbaru')}
      <div class="list" id="dashboard-sales">
        ${recentSales.length ? recentSales.map(saleItem).join('') : emptyState('Belum ada transaksi.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-sale"]').addEventListener('click', () => showSaleModal());
  setupSearch('dashboard-search', 'dashboard-sales', '.list-item');
  attachSaleActions();
  const week = weeklyRevenue();
  createChart('weekly', 'weekly-chart', {
    type: 'bar',
    data: {
      labels: week.labels,
      datasets: [{
        data: week.values,
        backgroundColor: '#C96A2B',
        borderRadius: 8
      }]
    },
    options: chartOptions()
  });
}

function statCard(label, value, warning = false) {
  return `
    <article class="card stat-card ${warning ? 'warning' : ''}">
      <p class="stat-label">${escapeHtml(label)}</p>
      <p class="stat-value">${escapeHtml(value)}</p>
    </article>
  `;
}

function saleItem(sale) {
  const status = paymentStatus(sale);
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(sale.buyer_name)}</p>
          <p class="item-meta">${itemSummary(sale.items)}</p>
          <p class="item-meta">${formatDate(sale.created_at)}</p>
        </div>
        <div class="sale-summary">
          <div class="status-badges">
            <span class="badge">${escapeHtml(sale.category || 'PENJUALAN')}</span>
            <span class="badge ${status.badge}">${status.label}</span>
          </div>
          <p class="item-meta">${formatCurrency(sale.total_amount)}</p>
          ${paidAmount(sale) > 0 && remainingAmount(sale) > 0
            ? `<p class="item-meta">Sisa ${formatCurrency(remainingAmount(sale))}</p>`
            : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn compact secondary" type="button" data-invoice-sale="${sale.id}">Invoice</button>
        <button class="btn compact secondary" type="button" data-edit-sale="${sale.id}">Ubah</button>
        <button class="btn compact ghost-danger" type="button" data-delete-sale="${sale.id}">Hapus</button>
      </div>
    </article>
  `;
}

function invoiceNumber(sale) {
  const date = new Date(sale.created_at);
  const year = Number.isNaN(date.getTime()) ? '0000' : date.getFullYear();
  const month = Number.isNaN(date.getTime()) ? '00' : String(date.getMonth() + 1).padStart(2, '0');
  const day = Number.isNaN(date.getTime()) ? '00' : String(date.getDate()).padStart(2, '0');
  return `INV-${year}${month}${day}-${String(sale.id).padStart(4, '0')}`;
}

function exportInvoice(sale) {
  if (!sale) {
    showToast('Transaksi tidak ditemukan', 'error');
    return;
  }

  const number = invoiceNumber(sale);
  const generatedAt = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
  const status = paymentStatus(sale);
  const statusLabel = status.label === 'Belum' ? 'Belum Dibayar' : status.label;
  const statusClass = status.invoiceClass;
  const paidStamp = remainingAmount(sale) === 0 ? '<div class="paid-stamp">LUNAS</div>' : '';
  const logoUrl = `${window.location.origin}/logo.png?v=20260523-10`;
  const itemRows = (sale.items || []).map((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price_per_box || 0);
    return `
      <tr>
        <td class="index">${index + 1}</td>
        <td>
          <strong>${escapeHtml(item.product_name)}</strong>
          <span>${qty} kotak x ${formatCurrency(price)}</span>
        </td>
        <td class="qty">${qty}</td>
        <td class="amount">${formatCurrency(price)}</td>
        <td class="amount">${formatCurrency(qty * price)}</td>
      </tr>
    `;
  }).join('');
  const html = `
    <!doctype html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Invoice ${escapeHtml(number)} - Bagus Bakery</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #f5efe7;
          color: #2c1810;
          font-family: Arial, sans-serif;
          line-height: 1.45;
        }
        .sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fffdf9;
          padding: 18mm;
          position: relative;
        }
        .paid-stamp {
          justify-self: end;
          align-self: center;
          transform: rotate(-14deg);
          border: 3px solid #1f7a3d;
          border-radius: 8px;
          padding: 7px 15px;
          color: #1f7a3d;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          opacity: 0.78;
        }
        .sheet::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 9mm;
          background: linear-gradient(90deg, #3d1c02, #c96a2b 48%, #d9a441);
        }
        .print-actions {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          background: rgba(245, 239, 231, 0.94);
          border-bottom: 1px solid #ead9c8;
          z-index: 2;
        }
        .print-actions button {
          min-height: 40px;
          border: 0;
          border-radius: 8px;
          padding: 9px 14px;
          background: #c96a2b;
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .print-actions button.secondary {
          background: white;
          color: #3d1c02;
          border: 1px solid #ead9c8;
        }
        .invoice-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 18px;
          align-items: center;
          margin-top: 10mm;
          padding-bottom: 10mm;
          border-bottom: 2px solid #ead9c8;
        }
        .logo-wrap {
          display: grid;
          width: 27mm;
          height: 27mm;
          place-items: center;
        }
        .logo {
          width: 22mm;
          height: 22mm;
          object-fit: contain;
        }
        .brand {
          color: #3d1c02;
          font-size: 29px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .brand-meta {
          margin-top: 4px;
          color: #8b6355;
          font-size: 11px;
        }
        .invoice-title {
          text-align: right;
        }
        .invoice-title h1 {
          margin: 0;
          color: #3d1c02;
          font-size: 31px;
          letter-spacing: 0;
        }
        .invoice-no {
          display: inline-block;
          margin-top: 6px;
          border-radius: 999px;
          padding: 6px 10px;
          background: #f5ecd7;
          color: #3d1c02;
          font-size: 11px;
          font-weight: 800;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 12mm 0 9mm;
        }
        .info-box {
          min-height: 34mm;
          border: 1px solid #ead9c8;
          border-radius: 8px;
          padding: 12px;
          background: #fffaf2;
        }
        .info-box h2 {
          margin: 0 0 8px;
          color: #8b6355;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .customer {
          margin: 0 0 5px;
          color: #3d1c02;
          font-size: 18px;
          font-weight: 800;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 4px 0;
          color: #8b6355;
          font-size: 11px;
        }
        .detail-row strong {
          color: #3d1c02;
          text-align: right;
        }
        .status {
          display: inline-block;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 800;
        }
        .status.paid {
          background: #e6f4ea;
          color: #1f7a3d;
        }
        .status.unpaid {
          background: #fff1db;
          color: #a65316;
        }
        .status.partial {
          background: #fff1db;
          color: #a65316;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }
        th {
          background: #3d1c02;
          color: white;
          font-size: 11px;
          text-align: left;
          padding: 9px 8px;
        }
        td {
          border-bottom: 1px solid #ead9c8;
          padding: 10px 8px;
          font-size: 11px;
          vertical-align: top;
        }
        td strong,
        td span {
          display: block;
        }
        td span {
          margin-top: 3px;
          color: #8b6355;
          font-size: 10px;
        }
        tr:nth-child(even) td { background: #fffaf2; }
        .index { width: 11mm; color: #8b6355; text-align: center; }
        .qty { width: 18mm; text-align: center; }
        .amount { text-align: right; white-space: nowrap; }
        .totals {
          display: grid;
          grid-template-columns: 1fr 72mm;
          gap: 12mm;
          align-items: start;
          margin-top: 10mm;
        }
        .payment-side {
          display: grid;
          gap: 4mm;
        }
        .notes {
          border: 1px solid #ead9c8;
          border-left: 4px solid #c96a2b;
          border-radius: 8px;
          padding: 11px;
          background: #fffaf2;
          color: #8b6355;
          font-size: 11px;
        }
        .notes h2 {
          margin: 0 0 5px;
          color: #3d1c02;
          font-size: 12px;
        }
        .total-box {
          border: 1px solid #ead9c8;
          border-radius: 8px;
          overflow: hidden;
          background: white;
        }
        .total-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 11px;
          border-bottom: 1px solid #ead9c8;
          color: #8b6355;
          font-size: 12px;
        }
        .total-line:last-child {
          border-bottom: 0;
          background: #3d1c02;
          color: white;
          font-size: 16px;
          font-weight: 800;
        }
        .footer {
          margin-top: 16mm;
          padding-top: 6mm;
          border-top: 1px solid #ead9c8;
          color: #8b6355;
          font-size: 10px;
          text-align: center;
        }
        @page { size: A4; margin: 0; }
        @media print {
          body { background: white; }
          .print-actions { display: none; }
          .sheet { width: auto; min-height: auto; margin: 0; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button onclick="window.print()">Cetak / Simpan PDF</button>
        <button class="secondary" onclick="window.close()">Tutup</button>
      </div>
      <main class="sheet">
        <header class="invoice-header">
          <div class="logo-wrap">
            <img class="logo" src="${escapeHtml(logoUrl)}" alt="Bagus Bakery" onerror="this.style.display='none'">
          </div>
          <div>
            <div class="brand">Bagus Bakery</div>
            <div class="brand-meta">Invoice penjualan kue dan pesanan bakery</div>
          </div>
          <div class="invoice-title">
            <h1>Invoice</h1>
            <div class="invoice-no">${escapeHtml(number)}</div>
          </div>
        </header>

        <section class="info-grid">
          <div class="info-box">
            <h2>Tagihan Kepada</h2>
            <p class="customer">${escapeHtml(sale.buyer_name)}</p>
            ${sale.notes ? `<div class="detail-row"><span>Catatan</span><strong>${escapeHtml(sale.notes)}</strong></div>` : ''}
          </div>
          <div class="info-box">
            <h2>Detail Invoice</h2>
            <div class="detail-row"><span>Nomor</span><strong>${escapeHtml(number)}</strong></div>
            <div class="detail-row"><span>Kategori</span><strong>${escapeHtml(sale.category || 'PENJUALAN')}</strong></div>
            <div class="detail-row"><span>Tanggal</span><strong>${formatDate(sale.created_at)}</strong></div>
            <div class="detail-row"><span>Status</span><strong><span class="status ${statusClass}">${statusLabel}</span></strong></div>
            <div class="detail-row"><span>Dibuat</span><strong>${escapeHtml(generatedAt)}</strong></div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th class="index">No</th>
              <th>Produk</th>
              <th class="qty">Qty</th>
              <th class="amount">Harga</th>
              <th class="amount">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <section class="totals">
          <div class="notes">
            <h2>Catatan Pembayaran</h2>
            <div>Mohon simpan invoice ini sebagai bukti pesanan. Untuk tagihan yang belum dibayar, pembayaran dapat dikonfirmasi langsung ke Bagus Bakery.</div>
          </div>
          <div class="payment-side">
            <div class="total-box">
              <div class="total-line"><span>Subtotal</span><strong>${formatCurrency(sale.total_amount)}</strong></div>
              <div class="total-line"><span>Sudah dibayar</span><strong>${formatCurrency(paidAmount(sale))}</strong></div>
              <div class="total-line"><span>Sisa tagihan</span><strong>${formatCurrency(remainingAmount(sale))}</strong></div>
            </div>
            ${paidStamp}
          </div>
        </section>

        <div class="footer">
          Terima kasih sudah berbelanja di Bagus Bakery.
        </div>
      </main>
    </body>
    </html>
  `;

  printDocumentHtml(html, {
    frameId: 'invoice-print-frame',
    title: 'Invoice PDF',
    successMessage: 'Invoice PDF siap disimpan'
  });
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function searchControl(id, placeholder, value = '') {
  return `
    <div class="search-box">
      <input
        id="${id}"
        type="search"
        placeholder="${escapeHtml(placeholder)}"
        aria-label="${escapeHtml(placeholder)}"
        value="${escapeHtml(value)}"
      >
    </div>
  `;
}

function setupSearch(inputId, containerId, itemSelector, onQueryChange) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;

  const noResults = document.createElement('div');
  noResults.className = 'empty-state search-empty';
  noResults.textContent = 'Data tidak ditemukan.';
  noResults.hidden = true;
  container.appendChild(noResults);
  const emptyStates = container.querySelectorAll('.empty-state:not(.search-empty)');

  const filterItems = () => {
    const query = input.value.trim().toLocaleLowerCase('id-ID');
    let visible = 0;
    container.querySelectorAll(itemSelector).forEach((item) => {
      const matches = !query || item.textContent.toLocaleLowerCase('id-ID').includes(query);
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    emptyStates.forEach((empty) => {
      empty.hidden = Boolean(query);
    });
    noResults.hidden = !query || visible > 0;
    if (onQueryChange) onQueryChange(input.value);
  };

  input.addEventListener('input', filterItems);
  filterItems();
}

function productOptions(selected = '') {
  return state.products.map((product) => `
    <option value="${product.id}" ${String(product.id) === String(selected) ? 'selected' : ''}>
      ${escapeHtml(product.name)}
    </option>
  `).join('');
}

function showSaleModal(sale) {
  const editing = Boolean(sale);
  openModal(editing ? 'Edit Penjualan' : 'Catat Penjualan Baru', `
    <form class="form-grid" id="sale-form">
      <div class="field">
        <label for="buyer-name">Nama pembeli</label>
        <input id="buyer-name" name="buyer_name" required autocomplete="name" value="${escapeHtml(sale?.buyer_name || '')}">
      </div>
      <div class="field">
        <label for="sale-date">Tanggal transaksi</label>
        <input id="sale-date" type="date" required value="${toDateInputValue(sale?.created_at)}">
      </div>
      <div class="field">
        <label for="sale-category">Kategori penjualan</label>
        <select id="sale-category" name="category">
          <option value="PENJUALAN" ${sale?.category !== 'ORDER' ? 'selected' : ''}>PENJUALAN</option>
          <option value="ORDER" ${sale?.category === 'ORDER' ? 'selected' : ''}>ORDER</option>
        </select>
      </div>
      <div id="sale-items" class="form-grid"></div>
      <button class="btn secondary" type="button" id="add-sale-item">+ Tambah Produk</button>
      <div class="summary-box">
        <div class="summary-line"><span>Total harga</span><strong id="sale-total">Rp0</strong></div>
      </div>
      <div class="field">
        <label for="sale-status">Status pembayaran</label>
        <select id="sale-status" name="status">
          <option value="paid" ${sale?.status === 'paid' ? 'selected' : ''}>Lunas</option>
          <option value="unpaid" ${sale?.status !== 'paid' ? 'selected' : ''}>Belum Bayar</option>
        </select>
      </div>
      <div class="field">
        <label for="sale-notes">Catatan</label>
        <textarea id="sale-notes" name="notes" rows="3">${escapeHtml(sale?.notes || '')}</textarea>
      </div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);

  const list = document.getElementById('sale-items');
  const addButton = document.getElementById('add-sale-item');
  const form = document.getElementById('sale-form');
  const total = document.getElementById('sale-total');

  function addRow(productId = state.products[0]?.id, qty = 1, price, productName = '') {
    const product = state.products.find((item) => String(item.id) === String(productId))
      || state.products.find((item) => item.name === productName)
      || state.products[0];
    const row = document.createElement('div');
    row.className = 'item-editor';
    row.innerHTML = `
      <div class="field">
        <label>Produk</label>
        <select class="sale-product" required>${productOptions(product?.id)}</select>
      </div>
      <div class="field">
        <label>Jumlah</label>
        <input class="sale-qty" type="number" min="1" value="${qty}" required>
      </div>
      <div class="field">
        <label>Harga/kotak</label>
        <input class="sale-price" type="number" min="0" value="${price ?? product?.price_per_box ?? 0}" required>
      </div>
      <button class="remove-item-button remove-row" type="button" aria-label="Hapus produk">
        <span aria-hidden="true">x</span>
        <span>Hapus produk</span>
      </button>
    `;
    list.appendChild(row);
    row.querySelector('.sale-product').addEventListener('change', (event) => {
      const selected = state.products.find((item) => String(item.id) === event.target.value);
      row.querySelector('.sale-price').value = selected?.price_per_box || 0;
      updateTotal();
    });
    row.querySelectorAll('input, select').forEach((field) => field.addEventListener('input', updateTotal));
    row.querySelector('.remove-row').addEventListener('click', () => {
      if (!window.confirm('Hapus produk ini dari transaksi?')) return;
      row.remove();
      if (!list.children.length) addRow();
      updateTotal();
    });
    updateTotal();
  }

  function readItems() {
    return Array.from(list.children).map((row) => {
      const selected = state.products.find((product) => String(product.id) === row.querySelector('.sale-product').value);
      return {
        product_name: selected?.name || 'Lainnya',
        qty: Number(row.querySelector('.sale-qty').value || 0),
        price_per_box: Number(row.querySelector('.sale-price').value || 0)
      };
    });
  }

  function updateTotal() {
    const sum = readItems().reduce((totalValue, item) => totalValue + item.qty * item.price_per_box, 0);
    total.textContent = formatCurrency(sum);
  }

  addButton.addEventListener('click', () => addRow());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(editing ? `/api/sales/${sale.id}` : '/api/sales', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          buyer_name: document.getElementById('buyer-name').value,
          created_at: document.getElementById('sale-date').value,
          category: document.getElementById('sale-category').value,
          items: readItems(),
          status: document.getElementById('sale-status').value,
          notes: document.getElementById('sale-notes').value
        })
      });
      closeModal();
      showToast('Penjualan tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  if (editing && sale.items?.length) {
    sale.items.forEach((item) => {
      const product = state.products.find((candidate) => candidate.name === item.product_name);
      addRow(product?.id, item.qty, item.price_per_box, item.product_name);
    });
  } else {
    addRow();
  }
}

function renderDebts() {
  let filter = 'all';
  let searchQuery = '';
  draw();

  function matchesDateFilter(sale) {
    const now = new Date();
    if (filter === 'week') return daysBetween(sale.created_at) <= 7;
    if (filter === 'month') return String(sale.created_at).startsWith(monthKey(now));
    return true;
  }

  function draw() {
    const orders = state.sales.filter((sale) => (
      sale.status === 'unpaid'
      && sale.category === 'ORDER'
      && matchesDateFilter(sale)
    ));
    const debts = state.sales.filter((sale) => (
      sale.status === 'unpaid'
      && sale.category !== 'ORDER'
      && matchesDateFilter(sale)
    ));
    const paid = state.sales.filter((sale) => sale.status === 'paid');
    const outstanding = [...orders, ...debts];
    const total = outstanding.reduce((sum, sale) => sum + remainingAmount(sale), 0);
    app.innerHTML = `
      <h1 class="page-title">Bon / Tagihan</h1>
      <p class="page-subtitle">Order, bon pelanggan, dan transaksi lunas dipisahkan agar mudah dipantau.</p>

      <div class="grid stats-grid">
        ${statCard('Total piutang', formatCurrency(total), total > 0)}
        ${statCard('Order aktif', `${orders.length}`)}
        ${statCard('Bon outstanding', `${debts.length}`)}
        ${statCard('Sudah lunas', `${paid.length}`)}
      </div>

      <div class="section">
        ${searchControl('debt-search', 'Cari nama pelanggan, produk, status, atau nominal', searchQuery)}
      </div>

      <div id="debt-search-results">
      <section class="section">
        <div class="section-header debt-page-header">
          <h2>Order <span class="section-count">${orders.length}</span></h2>
          <div class="segmented" id="debt-filter">
            <button type="button" data-filter="all" class="${filter === 'all' ? 'active' : ''}">Semua</button>
            <button type="button" data-filter="week" class="${filter === 'week' ? 'active' : ''}">7 hari</button>
            <button type="button" data-filter="month" class="${filter === 'month' ? 'active' : ''}">Bulan ini</button>
          </div>
        </div>
        <div class="list">
          ${orders.length ? orders.map(debtItem).join('') : emptyState('Tidak ada order aktif pada periode ini.')}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Bon <span class="section-count">${debts.length}</span></h2>
        </div>
        <div class="list">
          ${debts.length ? debts.map(debtItem).join('') : emptyState('Tidak ada bon outstanding pada periode ini.')}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Sudah Lunas <span class="section-count">${paid.length}</span></h2>
        </div>
        <div class="list">
          ${paid.length ? paid.map(saleItem).join('') : emptyState('Belum ada transaksi lunas.')}
        </div>
      </section>
      </div>
    `;
    setupSearch('debt-search', 'debt-search-results', '.list-item', (value) => {
      searchQuery = value;
    });
    app.querySelectorAll('#debt-filter button').forEach((button) => {
      button.addEventListener('click', () => {
        filter = button.dataset.filter;
        draw();
      });
    });
    app.querySelectorAll('[data-pay-id]').forEach((button) => button.addEventListener('click', markPaid));
    app.querySelectorAll('[data-partial-pay-id]').forEach((button) => button.addEventListener('click', () => {
      showPaymentModal(state.sales.find((sale) => String(sale.id) === button.dataset.partialPayId));
    }));
    attachSaleActions();
  }
}

function debtItem(sale) {
  const paid = paidAmount(sale);
  const remaining = remainingAmount(sale);
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(sale.buyer_name)}</p>
          <p class="item-meta">${itemSummary(sale.items)}</p>
          <p class="item-meta">${formatDate(sale.created_at)} - ${daysBetween(sale.created_at)} hari tertunggak</p>
        </div>
        <div style="text-align:right">
          <strong>${formatCurrency(remaining)}</strong>
          ${paid > 0 ? `<p class="item-meta">Terbayar ${formatCurrency(paid)} dari ${formatCurrency(sale.total_amount)}</p>` : ''}
        </div>
      </div>
      <div class="card-actions split">
        <div class="action-group">
          <button class="btn compact success" type="button" data-partial-pay-id="${sale.id}">Bayar Sebagian</button>
          <button class="btn compact secondary" type="button" data-pay-id="${sale.id}">Bayar Lunas</button>
          <button class="btn compact secondary" type="button" data-invoice-sale="${sale.id}">Cetak Invoice</button>
        </div>
        <div class="action-group">
          <button class="btn compact secondary" type="button" data-edit-sale="${sale.id}">Ubah</button>
          <button class="btn compact ghost-danger" type="button" data-delete-sale="${sale.id}">Hapus</button>
        </div>
      </div>
    </article>
  `;
}

function renderExpenses() {
  const today = localDateKey();
  const thisMonth = monthKey();
  const todaysExpenses = state.expenses.filter((expense) => String(expense.purchased_at).startsWith(today));
  const monthExpenses = state.expenses.filter((expense) => String(expense.purchased_at).startsWith(thisMonth));
  const monthTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const todayTotal = todaysExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const categoryTotals = monthExpenses.reduce((groups, expense) => {
    groups[expense.category] = (groups[expense.category] || 0) + expense.amount;
    return groups;
  }, {});

  app.innerHTML = `
    <h1 class="page-title">Belanja Bahan</h1>
    <p class="page-subtitle">Catat pembelian bahan, kemasan, dan biaya operasional produksi.</p>

    <div class="grid stats-grid">
      ${statCard('Belanja hari ini', formatCurrency(todayTotal), todayTotal > 0)}
      ${statCard('Persediaan masuk', formatCurrency(monthTotal), monthTotal > 0)}
      ${statCard('Jumlah catatan', `${monthExpenses.length}`)}
      ${statCard('Kategori aktif', `${Object.keys(categoryTotals).length}`)}
    </div>

    <div class="section">
      <button class="btn" type="button" data-action="new-expense">+ Catat Belanja</button>
    </div>

    <section class="section card panel">
      <div class="section-header"><h2>Breakdown Bulan Ini</h2></div>
      ${Object.keys(categoryTotals).length ? `
        <div class="summary-box">
          ${Object.entries(categoryTotals).map(([category, amount]) => `
            <div class="summary-line"><span>${escapeHtml(category)}</span><strong>${formatCurrency(amount)}</strong></div>
          `).join('')}
        </div>
      ` : '<p class="item-meta">Belum ada belanja bulan ini.</p>'}
    </section>

    <section class="section">
      <div class="section-header"><h2>Riwayat Belanja</h2></div>
      ${searchControl('expense-search', 'Cari nama barang, kategori, toko, atau catatan')}
      <div class="list" id="expense-list">
        ${state.expenses.length ? state.expenses.map(expenseItem).join('') : emptyState('Belum ada catatan belanja.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-expense"]').addEventListener('click', () => showExpenseModal());
  setupSearch('expense-search', 'expense-list', '.list-item');
  app.querySelectorAll('[data-edit-expense]').forEach((button) => button.addEventListener('click', () => {
    showExpenseModal(state.expenses.find((expense) => String(expense.id) === button.dataset.editExpense));
  }));
  app.querySelectorAll('[data-delete-expense]').forEach((button) => button.addEventListener('click', deleteExpense));
}

function expenseItem(expense) {
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(expense.name)}</p>
          <p class="item-meta">${escapeHtml(expense.category)}${expense.quantity ? ` - ${escapeHtml(expense.quantity)}` : ''}</p>
          <p class="item-meta">${formatDate(expense.purchased_at)}${expense.shop_name ? ` - ${escapeHtml(expense.shop_name)}` : ''}</p>
        </div>
        <strong>${formatCurrency(expense.amount)}</strong>
      </div>
      ${expense.notes ? `<p class="item-meta">${escapeHtml(expense.notes)}</p>` : ''}
      <div class="button-row">
        <button class="btn secondary" type="button" data-edit-expense="${expense.id}">Edit</button>
        <button class="btn danger" type="button" data-delete-expense="${expense.id}">Hapus</button>
      </div>
    </article>
  `;
}

function expenseCategoryOptions(selected = 'Bahan') {
  return ['Bahan', 'Kemasan', 'Operasional', 'Lainnya'].map((category) => `
    <option value="${category}" ${category === selected ? 'selected' : ''}>${category}</option>
  `).join('');
}

function toDateInputValue(value) {
  if (!value) return localDateKey();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localDateKey();
  return localDateKey(date);
}

function showExpenseModal(expense) {
  const editing = Boolean(expense);
  openModal(editing ? 'Edit Belanja' : 'Catat Belanja', `
    <form class="form-grid" id="expense-form">
      <div class="field">
        <label for="expense-date">Tanggal belanja</label>
        <input id="expense-date" type="date" required value="${toDateInputValue(expense?.purchased_at)}">
      </div>
      <div class="field">
        <label for="expense-name">Nama bahan / biaya</label>
        <input id="expense-name" required value="${escapeHtml(expense?.name || '')}" placeholder="Butter, keju, dus kemasan">
      </div>
      <div class="grid two-col">
        <div class="field">
          <label for="expense-category">Kategori</label>
          <select id="expense-category">${expenseCategoryOptions(expense?.category || 'Bahan')}</select>
        </div>
        <div class="field">
          <label for="expense-quantity">Jumlah / satuan</label>
          <input id="expense-quantity" value="${escapeHtml(expense?.quantity || '')}" placeholder="1 kg, 2 dus">
        </div>
      </div>
      <div class="grid two-col">
        <div class="field">
          <label for="expense-amount">Nominal</label>
          <input id="expense-amount" type="number" min="0" required value="${expense?.amount || 0}">
        </div>
        <div class="field">
          <label for="expense-shop">Tempat beli</label>
          <input id="expense-shop" value="${escapeHtml(expense?.shop_name || '')}" placeholder="Toko bahan kue">
        </div>
      </div>
      <div class="field">
        <label for="expense-notes">Catatan</label>
        <textarea id="expense-notes" rows="3">${escapeHtml(expense?.notes || '')}</textarea>
      </div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);

  document.getElementById('expense-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(editing ? `/api/expenses/${expense.id}` : '/api/expenses', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          purchased_at: document.getElementById('expense-date').value,
          name: document.getElementById('expense-name').value,
          category: document.getElementById('expense-category').value,
          quantity: document.getElementById('expense-quantity').value,
          amount: Number(document.getElementById('expense-amount').value),
          shop_name: document.getElementById('expense-shop').value,
          notes: document.getElementById('expense-notes').value
        })
      });
      closeModal();
      showToast('Belanja tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function deleteExpense(event) {
  const id = event.currentTarget.dataset.deleteExpense;
  if (!window.confirm('Hapus catatan belanja ini?')) return;
  try {
    await api(`/api/expenses/${id}`, { method: 'DELETE' });
    showToast('Catatan belanja dihapus');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function markPaid(event) {
  const id = event.currentTarget.dataset.payId;
  if (!window.confirm('Catat pembayaran seluruh sisa tagihan?')) return;
  try {
    await api(`/api/sales/${id}/pay`, { method: 'PATCH' });
    showToast('Pembayaran lunas dicatat');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function showPaymentModal(sale) {
  if (!sale || remainingAmount(sale) <= 0) return;
  const remaining = remainingAmount(sale);
  openModal('Bayar Sebagian', `
    <form class="form-grid" id="partial-payment-form">
      <div class="summary-box">
        <div class="summary-line"><span>Total tagihan</span><strong>${formatCurrency(sale.total_amount)}</strong></div>
        <div class="summary-line"><span>Sudah dibayar</span><strong>${formatCurrency(paidAmount(sale))}</strong></div>
        <div class="summary-line"><span>Sisa tagihan</span><strong>${formatCurrency(remaining)}</strong></div>
      </div>
      <div class="field">
        <label for="payment-amount">Nominal pembayaran</label>
        <input id="payment-amount" type="number" min="1" max="${remaining}" value="${remaining}" required>
      </div>
      <div class="field">
        <label for="payment-date">Tanggal pembayaran</label>
        <input id="payment-date" type="date" value="${localDateKey()}" required>
      </div>
      <button class="btn success" type="submit">Simpan Pembayaran</button>
    </form>
  `);

  document.getElementById('partial-payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/sales/${sale.id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount: Number(document.getElementById('payment-amount').value),
          paid_at: document.getElementById('payment-date').value
        })
      });
      closeModal();
      showToast('Pembayaran sebagian dicatat');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function attachSaleActions() {
  app.querySelectorAll('[data-invoice-sale]').forEach((button) => button.addEventListener('click', () => {
    exportInvoice(state.sales.find((sale) => String(sale.id) === button.dataset.invoiceSale));
  }));
  app.querySelectorAll('[data-edit-sale]').forEach((button) => button.addEventListener('click', () => {
    showSaleModal(state.sales.find((sale) => String(sale.id) === button.dataset.editSale));
  }));
  app.querySelectorAll('[data-delete-sale]').forEach((button) => button.addEventListener('click', deleteSale));
}

async function deleteSale(event) {
  const id = event.currentTarget.dataset.deleteSale;
  if (!window.confirm('Hapus transaksi penjualan ini?')) return;
  try {
    await api(`/api/sales/${id}`, { method: 'DELETE' });
    showToast('Transaksi penjualan dihapus');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderCash() {
  const summary = state.cash.summary || { total_in: 0, total_out: 0, balance: 0 };
  const manualEntries = state.cash.entries.filter((entry) => entry.source === 'cash');
  app.innerHTML = `
    <h1 class="page-title">Kas</h1>
    <p class="page-subtitle">Buku kas dari modal, pembayaran penjualan, belanja, dan koreksi manual.</p>

    <div class="grid stats-grid">
      ${statCard('Saldo kas', formatCurrency(summary.balance), summary.balance < 0)}
      ${statCard('Dana masuk', formatCurrency(summary.total_in))}
      ${statCard('Dana keluar', formatCurrency(summary.total_out), summary.total_out > 0)}
      ${statCard('Catatan manual', `${manualEntries.length}`)}
    </div>

    <div class="section cash-action-grid">
      <button class="btn" type="button" data-action="cash-capital">+ Modal Masuk</button>
      <button class="btn secondary" type="button" data-action="cash-out">+ Dana Keluar</button>
      <button class="btn secondary" type="button" data-action="cash-adjustment">Koreksi Kas</button>
    </div>

    <section class="section">
      <div class="section-header"><h2>Riwayat Kas</h2></div>
      ${searchControl('cash-search', 'Cari keterangan, kategori, sumber, atau nominal')}
      <div class="list" id="cash-list">
        ${state.cash.entries.length ? state.cash.entries.map(cashItem).join('') : emptyState('Belum ada catatan kas.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="cash-capital"]').addEventListener('click', () => showCashModal(null, {
    type: 'in',
    category: 'capital',
    description: 'Modal masuk'
  }));
  app.querySelector('[data-action="cash-out"]').addEventListener('click', () => showCashModal(null, {
    type: 'out',
    category: 'manual_out',
    description: 'Dana keluar'
  }));
  app.querySelector('[data-action="cash-adjustment"]').addEventListener('click', () => showCashModal(null, {
    type: 'in',
    category: 'adjustment',
    description: 'Koreksi kas'
  }));
  setupSearch('cash-search', 'cash-list', '.list-item');
  app.querySelectorAll('[data-edit-cash]').forEach((button) => button.addEventListener('click', () => {
    showCashModal(state.cash.entries.find((entry) => String(entry.raw_id) === button.dataset.editCash && entry.source === 'cash'));
  }));
  app.querySelectorAll('[data-delete-cash]').forEach((button) => button.addEventListener('click', deleteCash));
}

function cashItem(entry) {
  const incoming = entry.type === 'in';
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(entry.description)}</p>
          <p class="item-meta">${escapeHtml(entry.category_label)} - ${formatDate(entry.date)}</p>
          ${entry.notes ? `<p class="item-meta">${escapeHtml(entry.notes)}</p>` : ''}
        </div>
        <div>
          <span class="badge ${incoming ? 'success' : 'danger'}">${incoming ? 'Masuk' : 'Keluar'}</span>
          <p class="item-meta" style="text-align:right">${formatCurrency(entry.amount)}</p>
        </div>
      </div>
      ${entry.editable ? `
        <div class="button-row">
          <button class="btn secondary" type="button" data-edit-cash="${entry.raw_id}">Edit</button>
          <button class="btn danger" type="button" data-delete-cash="${entry.raw_id}">Hapus</button>
        </div>
      ` : `<p class="item-meta">Otomatis dari ${entry.source === 'sale' ? 'pembayaran penjualan' : 'belanja'}.</p>`}
    </article>
  `;
}

function cashCategoryOptions(selected = 'capital') {
  const options = [
    ['capital', 'Modal'],
    ['manual_in', 'Dana Masuk'],
    ['manual_out', 'Dana Keluar'],
    ['adjustment', 'Koreksi Kas']
  ];
  return options.map(([value, label]) => `
    <option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>
  `).join('');
}

function showCashModal(entry, defaults = {}) {
  const editing = Boolean(entry);
  const type = entry?.type || defaults.type || 'in';
  const category = entry?.category || defaults.category || 'capital';
  openModal(editing ? 'Edit Catatan Kas' : 'Tambah Catatan Kas', `
    <form class="form-grid" id="cash-form">
      <div class="field">
        <label for="cash-date">Tanggal</label>
        <input id="cash-date" type="date" required value="${toDateInputValue(entry?.date)}">
      </div>
      <div class="grid two-col">
        <div class="field">
          <label for="cash-type">Tipe</label>
          <select id="cash-type">
            <option value="in" ${type !== 'out' ? 'selected' : ''}>Masuk</option>
            <option value="out" ${type === 'out' ? 'selected' : ''}>Keluar</option>
          </select>
        </div>
        <div class="field">
          <label for="cash-category">Kategori</label>
          <select id="cash-category">${cashCategoryOptions(category)}</select>
        </div>
      </div>
      <div class="field">
        <label for="cash-description">Keterangan</label>
        <input id="cash-description" required value="${escapeHtml(entry?.description || defaults.description || '')}" placeholder="Modal awal, tarik tunai, koreksi saldo">
      </div>
      <div class="field">
        <label for="cash-amount">Nominal</label>
        <input id="cash-amount" type="number" min="1" required value="${entry?.amount || 0}">
      </div>
      <div class="field">
        <label for="cash-notes">Catatan</label>
        <textarea id="cash-notes" rows="3">${escapeHtml(entry?.notes || '')}</textarea>
      </div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);

  document.getElementById('cash-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(editing ? `/api/cash/${entry.raw_id}` : '/api/cash', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          transaction_date: document.getElementById('cash-date').value,
          type: document.getElementById('cash-type').value,
          category: document.getElementById('cash-category').value,
          description: document.getElementById('cash-description').value,
          amount: Number(document.getElementById('cash-amount').value),
          notes: document.getElementById('cash-notes').value
        })
      });
      closeModal();
      showToast('Catatan kas tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function deleteCash(event) {
  const id = event.currentTarget.dataset.deleteCash;
  if (!window.confirm('Hapus catatan kas ini?')) return;
  try {
    await api(`/api/cash/${id}`, { method: 'DELETE' });
    showToast('Catatan kas dihapus');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderCalculator() {
  app.innerHTML = `
    <h1 class="page-title">Kalkulator</h1>
    <p class="page-subtitle">Kelola harga produk dan hitung keuntungan per resep.</p>

    <section class="section">
      <div class="section-header">
        <h2>Produk & Harga</h2>
        <button class="btn" type="button" data-action="new-product">+ Tambah Produk</button>
      </div>
      ${searchControl('product-search', 'Cari produk atau harga')}
      <div class="table-wrap" id="product-list">
        <table>
          <thead><tr><th>Produk</th><th>Harga/kotak</th><th>Aksi</th></tr></thead>
          <tbody>
            ${state.products.map((product) => `
              <tr>
                <td>${escapeHtml(product.name)}</td>
                <td>${formatCurrency(product.price_per_box)}</td>
                <td>
                  <div class="button-row">
                    <button class="btn secondary" type="button" data-edit-product="${product.id}">Edit</button>
                    <button class="btn danger" type="button" data-delete-product="${product.id}">Hapus</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section card panel">
      <div class="section-header">
        <h2>Hitung Untung Resep</h2>
      </div>
      <form class="form-grid" id="calc-form">
        <div class="field">
          <label for="calc-product">Pilih produk</label>
          <select id="calc-product" required>${productOptions()}</select>
        </div>
        <div id="ingredient-list" class="form-grid"></div>
        <button class="btn secondary" type="button" id="add-ingredient">+ Tambah Bahan</button>
        <div class="grid two-col">
          <div class="field">
            <label for="extra-costs">Biaya tambahan</label>
            <input id="extra-costs" type="number" min="0" value="0">
          </div>
          <div class="field">
            <label for="boxes-produced">Total kotak batch</label>
            <input id="boxes-produced" type="number" min="1" value="1" required>
          </div>
          <div class="field">
            <label for="selling-price">Harga jual/kotak</label>
            <input id="selling-price" type="number" min="0" value="${state.products[0]?.price_per_box || 0}" required>
          </div>
        </div>
        <div class="summary-box" id="calc-result"></div>
        <button class="btn" type="submit">Simpan Kalkulasi</button>
      </form>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Riwayat Kalkulasi</h2>
      </div>
      ${searchControl('calculation-search', 'Cari produk, tanggal, margin, atau keuntungan')}
      <div class="list" id="calculation-list">
        ${state.calculations.length ? state.calculations.map(calcItem).join('') : emptyState('Belum ada kalkulasi tersimpan.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-product"]').addEventListener('click', () => showProductModal());
  setupSearch('product-search', 'product-list', 'tbody tr');
  setupSearch('calculation-search', 'calculation-list', '.list-item');
  app.querySelectorAll('[data-edit-product]').forEach((button) => button.addEventListener('click', () => {
    showProductModal(state.products.find((item) => String(item.id) === button.dataset.editProduct));
  }));
  app.querySelectorAll('[data-delete-product]').forEach((button) => button.addEventListener('click', deleteProduct));
  app.querySelectorAll('[data-edit-calc]').forEach((button) => button.addEventListener('click', () => {
    showCalculationModal(state.calculations.find((calc) => String(calc.id) === button.dataset.editCalc));
  }));
  app.querySelectorAll('[data-delete-calc]').forEach((button) => button.addEventListener('click', deleteCalculation));
  setupCalculatorForm();
}

function calcItem(calc) {
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(calc.product_name)}</p>
          <p class="item-meta">${formatDate(calc.created_at)} - Margin ${calc.margin_percent}%</p>
        </div>
        <strong>${formatCurrency(calc.profit_per_box)}/kotak</strong>
      </div>
      <div class="button-row">
        <button class="btn secondary" type="button" data-edit-calc="${calc.id}">Edit</button>
        <button class="btn danger" type="button" data-delete-calc="${calc.id}">Hapus</button>
      </div>
    </article>
  `;
}

function setupCalculatorForm() {
  const ingredientList = document.getElementById('ingredient-list');
  const addButton = document.getElementById('add-ingredient');
  const productSelect = document.getElementById('calc-product');
  const sellingPrice = document.getElementById('selling-price');
  const form = document.getElementById('calc-form');

  function addIngredient() {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <div class="field">
        <label>Nama bahan</label>
        <input class="ingredient-name" required>
      </div>
      <div class="field">
        <label>Jumlah</label>
        <input class="ingredient-quantity" placeholder="500 gram">
      </div>
      <div class="field">
        <label>Harga</label>
        <input class="ingredient-price" type="number" min="0" value="0" required>
      </div>
      <button class="icon-button remove-ingredient" type="button" aria-label="Hapus">x</button>
    `;
    ingredientList.appendChild(row);
    row.querySelectorAll('input').forEach((input) => input.addEventListener('input', updateResult));
    row.querySelector('.remove-ingredient').addEventListener('click', () => {
      if (!window.confirm('Hapus bahan ini dari kalkulasi?')) return;
      row.remove();
      if (!ingredientList.children.length) addIngredient();
      updateResult();
    });
    updateResult();
  }

  function readIngredients() {
    return Array.from(ingredientList.children).map((row) => ({
      name: row.querySelector('.ingredient-name').value,
      quantity: row.querySelector('.ingredient-quantity').value,
      price: Number(row.querySelector('.ingredient-price').value || 0)
    }));
  }

  function calculationPayload() {
    const ingredients = readIngredients();
    const extraCosts = Number(document.getElementById('extra-costs').value || 0);
    const boxesProduced = Number(document.getElementById('boxes-produced').value || 1);
    const selling = Number(sellingPrice.value || 0);
    const totalCost = ingredients.reduce((sum, item) => sum + item.price, 0) + extraCosts;
    const revenue = boxesProduced * selling;
    const profitBatch = revenue - totalCost;
    return {
      product_name: state.products.find((product) => String(product.id) === productSelect.value)?.name || '',
      ingredients,
      extra_costs: extraCosts,
      boxes_produced: boxesProduced,
      selling_price_per_box: selling,
      totalCost,
      costPerBox: boxesProduced > 0 ? totalCost / boxesProduced : 0,
      revenue,
      profitPerBox: boxesProduced > 0 ? selling - totalCost / boxesProduced : 0,
      profitBatch,
      margin: revenue > 0 ? (profitBatch / revenue) * 100 : 0
    };
  }

  function updateResult() {
    const calc = calculationPayload();
    document.getElementById('calc-result').innerHTML = `
      <div class="summary-line"><span>Total biaya produksi</span><strong>${formatCurrency(calc.totalCost)}</strong></div>
      <div class="summary-line"><span>Harga jual per kotak</span><strong>${formatCurrency(calc.selling_price_per_box)}</strong></div>
      <div class="summary-line"><span>Hasil penjualan</span><strong>${formatCurrency(calc.revenue)}</strong></div>
      <div class="summary-line"><span>Untung per kotak</span><strong>${formatCurrency(calc.profitPerBox)}</strong></div>
      <div class="summary-line"><span>Untung per batch</span><strong>${formatCurrency(calc.profitBatch)}</strong></div>
      <div class="summary-line"><span>Margin</span><strong>${calc.margin.toFixed(1)}%</strong></div>
    `;
  }

  addButton.addEventListener('click', addIngredient);
  productSelect.addEventListener('change', () => {
    const product = state.products.find((item) => String(item.id) === productSelect.value);
    sellingPrice.value = product?.price_per_box || 0;
    updateResult();
  });
  ['extra-costs', 'boxes-produced', 'selling-price'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateResult);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = calculationPayload();
      await api('/api/calculations', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Kalkulasi tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  addIngredient();
}

function showProductModal(product) {
  const editing = Boolean(product);
  openModal(editing ? 'Edit Produk' : 'Tambah Produk', `
    <form class="form-grid" id="product-form">
      <div class="field">
        <label for="product-name">Nama produk</label>
        <input id="product-name" required value="${escapeHtml(product?.name || '')}">
      </div>
      <div class="field">
        <label for="product-price">Harga jual per kotak</label>
        <input id="product-price" type="number" min="0" required value="${product?.price_per_box || 0}">
      </div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);
  document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(editing ? `/api/products/${product.id}` : '/api/products', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: document.getElementById('product-name').value,
          price_per_box: Number(document.getElementById('product-price').value)
        })
      });
      closeModal();
      showToast('Produk tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function showCalculationModal(calc) {
  if (!calc) return;
  openModal('Edit Kalkulasi', `
    <form class="form-grid" id="edit-calc-form">
      <div class="field">
        <label for="edit-calc-product">Nama produk</label>
        <input id="edit-calc-product" required value="${escapeHtml(calc.product_name)}">
      </div>
      <div id="edit-ingredient-list" class="form-grid"></div>
      <button class="btn secondary" type="button" id="edit-add-ingredient">+ Tambah Bahan</button>
      <div class="grid two-col">
        <div class="field">
          <label for="edit-extra-costs">Biaya tambahan</label>
          <input id="edit-extra-costs" type="number" min="0" value="${calc.extra_costs || 0}">
        </div>
        <div class="field">
          <label for="edit-boxes-produced">Total kotak batch</label>
          <input id="edit-boxes-produced" type="number" min="1" value="${calc.boxes_produced || 1}" required>
        </div>
        <div class="field">
          <label for="edit-selling-price">Harga jual/kotak</label>
          <input id="edit-selling-price" type="number" min="0" value="${calc.selling_price_per_box || 0}" required>
        </div>
      </div>
      <div class="summary-box" id="edit-calc-result"></div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);

  const ingredientList = document.getElementById('edit-ingredient-list');

  function addIngredient(item = {}) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <div class="field">
        <label>Nama bahan</label>
        <input class="ingredient-name" required value="${escapeHtml(item.name || '')}">
      </div>
      <div class="field">
        <label>Jumlah</label>
        <input class="ingredient-quantity" value="${escapeHtml(item.quantity || '')}" placeholder="500 gram">
      </div>
      <div class="field">
        <label>Harga</label>
        <input class="ingredient-price" type="number" min="0" value="${item.price || 0}" required>
      </div>
      <button class="icon-button remove-ingredient" type="button" aria-label="Hapus">x</button>
    `;
    ingredientList.appendChild(row);
    row.querySelectorAll('input').forEach((input) => input.addEventListener('input', updateResult));
    row.querySelector('.remove-ingredient').addEventListener('click', () => {
      if (!window.confirm('Hapus bahan ini dari kalkulasi?')) return;
      row.remove();
      if (!ingredientList.children.length) addIngredient();
      updateResult();
    });
    updateResult();
  }

  function readIngredients() {
    return Array.from(ingredientList.children).map((row) => ({
      name: row.querySelector('.ingredient-name').value,
      quantity: row.querySelector('.ingredient-quantity').value,
      price: Number(row.querySelector('.ingredient-price').value || 0)
    }));
  }

  function payload() {
    const ingredients = readIngredients();
    const extraCosts = Number(document.getElementById('edit-extra-costs').value || 0);
    const boxesProduced = Number(document.getElementById('edit-boxes-produced').value || 1);
    const selling = Number(document.getElementById('edit-selling-price').value || 0);
    const totalCost = ingredients.reduce((sum, item) => sum + item.price, 0) + extraCosts;
    const revenue = boxesProduced * selling;
    const profitBatch = revenue - totalCost;
    return {
      product_name: document.getElementById('edit-calc-product').value,
      ingredients,
      extra_costs: extraCosts,
      boxes_produced: boxesProduced,
      selling_price_per_box: selling,
      totalCost,
      revenue,
      profitPerBox: boxesProduced > 0 ? selling - totalCost / boxesProduced : 0,
      profitBatch,
      margin: revenue > 0 ? (profitBatch / revenue) * 100 : 0
    };
  }

  function updateResult() {
    const data = payload();
    document.getElementById('edit-calc-result').innerHTML = `
      <div class="summary-line"><span>Total biaya produksi</span><strong>${formatCurrency(data.totalCost)}</strong></div>
      <div class="summary-line"><span>Hasil penjualan</span><strong>${formatCurrency(data.revenue)}</strong></div>
      <div class="summary-line"><span>Untung per kotak</span><strong>${formatCurrency(data.profitPerBox)}</strong></div>
      <div class="summary-line"><span>Untung per batch</span><strong>${formatCurrency(data.profitBatch)}</strong></div>
      <div class="summary-line"><span>Margin</span><strong>${data.margin.toFixed(1)}%</strong></div>
    `;
  }

  document.getElementById('edit-add-ingredient').addEventListener('click', () => addIngredient());
  ['edit-extra-costs', 'edit-boxes-produced', 'edit-selling-price', 'edit-calc-product'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateResult);
  });
  document.getElementById('edit-calc-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/calculations/${calc.id}`, { method: 'PUT', body: JSON.stringify(payload()) });
      closeModal();
      showToast('Kalkulasi tersimpan');
      await route();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  (calc.ingredients?.length ? calc.ingredients : [{}]).forEach(addIngredient);
}

async function deleteProduct(event) {
  const id = event.currentTarget.dataset.deleteProduct;
  if (!window.confirm('Hapus produk ini?')) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    showToast('Produk dihapus');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteCalculation(event) {
  const id = event.currentTarget.dataset.deleteCalc;
  if (!window.confirm('Hapus kalkulasi ini?')) return;
  try {
    await api(`/api/calculations/${id}`, { method: 'DELETE' });
    showToast('Kalkulasi dihapus');
    await route();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function renderReports() {
  const date = new Date();
  const year = Number(new URLSearchParams(window.location.search).get('year') || date.getFullYear());
  const month = Number(new URLSearchParams(window.location.search).get('month') || date.getMonth() + 1);
  const report = await api(`/api/reports/monthly?year=${year}&month=${month}`);
  const bestProduct = report.revenue_by_product[0];

  app.innerHTML = `
    <h1 class="page-title">Laporan Bulanan</h1>
    <p class="page-subtitle">Rekap performa bisnis untuk ${escapeHtml(report.period)}.</p>

    <div class="section-header">
      <button class="btn secondary" type="button" data-month-nav="-1">&lt;</button>
      <h2>${escapeHtml(report.period)}</h2>
      <button class="btn secondary" type="button" data-month-nav="1">&gt;</button>
    </div>

    <div class="section report-export-card">
      <div>
        <p class="report-export-title">Export laporan PDF</p>
        <p class="report-export-copy">Format A4 rapi dengan ringkasan, tabel, dan estimasi profit.</p>
      </div>
      <button class="btn" type="button" id="export-report">Cetak / Simpan PDF</button>
    </div>

    <div class="grid stats-grid report-stats">
      ${statCard('Total pemasukan', formatCurrency(report.total_revenue))}
      ${statCard('Persediaan masuk', formatCurrency(report.total_expenses), report.total_expenses > 0)}
      ${statCard('Total transaksi', `${report.total_transactions}`)}
      ${statCard('Masih piutang', formatCurrency(report.total_unpaid), report.total_unpaid > 0)}
      ${statCard('Kotak terjual', `${report.total_boxes_sold}`)}
    </div>

    <section class="section card panel chart-panel">
      <div class="section-header"><h2>Penjualan Harian</h2></div>
      <div class="chart-wrap"><canvas id="monthly-chart"></canvas></div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Breakdown Produk</h2>
        ${bestProduct ? `<span class="badge">Terlaris: ${escapeHtml(bestProduct.product_name)}</span>` : ''}
      </div>
      <div class="table-wrap report-table report-product-table">
        <table>
          <thead><tr><th>Produk</th><th>Kotak</th><th>Pendapatan</th><th>%</th></tr></thead>
          <tbody>
            ${report.revenue_by_product.length ? report.revenue_by_product.map((item) => `
              <tr>
                <td data-label="Produk">${escapeHtml(item.product_name)}</td>
                <td data-label="Kotak">${item.boxes}</td>
                <td data-label="Pendapatan">${formatCurrency(item.revenue)}</td>
                <td data-label="Kontribusi">${item.percentage}%</td>
              </tr>
            `).join('') : '<tr><td colspan="4">Belum ada transaksi bulan ini.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Breakdown Persediaan Masuk</h2></div>
      <div class="table-wrap report-table report-expense-table">
        <table>
          <thead><tr><th>Kategori</th><th>Catatan</th><th>Total</th></tr></thead>
          <tbody>
            ${report.expenses_by_category.length ? report.expenses_by_category.map((item) => `
              <tr>
                <td data-label="Kategori">${escapeHtml(item.category)}</td>
                <td data-label="Catatan">${item.count}</td>
                <td data-label="Total">${formatCurrency(item.amount)}</td>
              </tr>
            `).join('') : '<tr><td colspan="3">Belum ada persediaan masuk bulan ini.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section card panel">
      <div class="section-header"><h2>Estimasi Keuntungan Bersih</h2></div>
      ${profitSummary(report.estimated_profit)}
    </section>

    <section class="section grid two-col">
      ${statCard('Pemasukan vs bulan lalu', `${formatCurrency(report.vs_last_month.revenue_change)} (${report.vs_last_month.revenue_change_percent}%)`, report.vs_last_month.revenue_change < 0)}
      ${statCard('Transaksi vs bulan lalu', `${report.vs_last_month.transaction_change}`)}
    </section>

    <details class="section card panel">
      <summary class="compact-title">Daftar transaksi bulan ini</summary>
      <div style="margin-top:14px">
        ${searchControl('report-transaction-search', 'Cari transaksi bulan ini')}
      </div>
      <div class="list" id="report-transaction-list">
        ${state.sales.filter((sale) => String(sale.created_at).startsWith(`${year}-${String(month).padStart(2, '0')}`)).map(saleItem).join('') || emptyState('Tidak ada transaksi.')}
      </div>
    </details>
  `;

  app.querySelectorAll('[data-month-nav]').forEach((button) => button.addEventListener('click', () => {
    const next = new Date(year, month - 1 + Number(button.dataset.monthNav), 1);
    window.history.replaceState(null, '', `?year=${next.getFullYear()}&month=${next.getMonth() + 1}${window.location.hash || '#laporan'}`);
    route();
  }));
  document.getElementById('export-report').addEventListener('click', () => exportReport(report, year, month));
  setupSearch('report-transaction-search', 'report-transaction-list', '.list-item');
  attachSaleActions();
  createChart('monthly', 'monthly-chart', {
    type: 'line',
    data: {
      labels: report.daily_revenue.map((item) => Number(item.date.slice(-2))),
      datasets: [{
        data: report.daily_revenue.map((item) => item.revenue),
        borderColor: '#C96A2B',
        backgroundColor: 'rgba(201, 106, 43, 0.12)',
        fill: true,
        tension: 0.25
      }]
    },
    options: chartOptions()
  });
}

function profitSummary(profit) {
  if (!profit.has_calculation_data) {
    return `<p class="item-meta">Simpan kalkulasi resep di halaman Kalkulator untuk melihat estimasi keuntungan bersih.</p>`;
  }
  return `
    <div class="summary-box">
      <div class="summary-line"><span>Total pemasukan lunas</span><strong>${formatCurrency(profit.total_revenue_paid)}</strong></div>
      <div class="summary-line"><span>Estimasi modal produksi</span><strong>${formatCurrency(profit.estimated_cogs)}</strong></div>
      <div class="summary-line"><span>Estimasi untung bersih</span><strong>${formatCurrency(profit.net_profit)}</strong></div>
      <div class="summary-line"><span>Margin bersih</span><strong>${profit.margin_percent}%</strong></div>
    </div>
  `;
}

function exportReport(report, year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const transactions = state.sales.filter((sale) => String(sale.created_at).startsWith(key));
  const generatedAt = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
  const logoUrl = `${window.location.origin}/logo.png?v=20260523-10`;
  const html = `
    <!doctype html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Laporan Bagus Bakery - ${escapeHtml(report.period)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #f5efe7;
          color: #2c1810;
          font-family: Arial, sans-serif;
          line-height: 1.4;
        }
        .sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fffdf9;
          padding: 18mm;
          position: relative;
        }
        .sheet::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 9mm;
          background: linear-gradient(90deg, #3d1c02, #c96a2b 45%, #d9a441);
        }
        .print-actions {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          background: rgba(245, 239, 231, 0.92);
          border-bottom: 1px solid #ead9c8;
        }
        .print-actions button {
          min-height: 40px;
          border: 0;
          border-radius: 8px;
          padding: 9px 14px;
          background: #c96a2b;
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .print-actions button.secondary {
          background: white;
          color: #3d1c02;
          border: 1px solid #ead9c8;
        }
        .report-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 18px;
          align-items: center;
          margin-top: 10mm;
          padding-bottom: 10mm;
          border-bottom: 2px solid #ead9c8;
        }
        .logo-wrap {
          display: grid;
          width: 28mm;
          height: 28mm;
          place-items: center;
        }
        .logo {
          width: 23mm;
          height: 23mm;
          object-fit: contain;
        }
        .brand {
          color: #3d1c02;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .title {
          margin: 5px 0 0;
          color: #c96a2b;
          font-size: 18px;
          font-weight: 800;
        }
        .meta {
          text-align: right;
          color: #8b6355;
          font-size: 12px;
        }
        .period-pill {
          display: inline-block;
          margin-bottom: 7px;
          border-radius: 999px;
          padding: 6px 10px;
          background: #f5ecd7;
          color: #3d1c02;
          font-weight: 800;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 12mm 0 8mm;
        }
        .metric {
          min-height: 28mm;
          border: 1px solid #ead9c8;
          border-left: 4px solid #c96a2b;
          border-radius: 8px;
          padding: 10px;
          background: #fffaf2;
        }
        .metric .label {
          margin: 0 0 5px;
          color: #8b6355;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .metric .value {
          margin: 0;
          color: #3d1c02;
          font-size: 18px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .section-title {
          margin: 9mm 0 4mm;
          color: #3d1c02;
          font-size: 15px;
          font-weight: 800;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          page-break-inside: avoid;
          background: white;
        }
        th {
          background: #3d1c02;
          color: white;
          font-size: 11px;
          text-align: left;
          padding: 8px;
        }
        td {
          border-bottom: 1px solid #ead9c8;
          padding: 8px;
          font-size: 11px;
          vertical-align: top;
        }
        tr:nth-child(even) td { background: #fffaf2; }
        .amount { text-align: right; white-space: nowrap; }
        .profit-box {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          border: 1px solid #ead9c8;
          border-radius: 8px;
          padding: 10px;
          background: #f5ecd7;
        }
        .profit-box span {
          display: block;
          color: #8b6355;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .profit-box strong {
          display: block;
          margin-top: 4px;
          color: #3d1c02;
          font-size: 13px;
        }
        .footer {
          margin-top: 12mm;
          padding-top: 5mm;
          border-top: 1px solid #ead9c8;
          color: #8b6355;
          font-size: 10px;
          text-align: center;
        }
        @page { size: A4; margin: 0; }
        @media print {
          body { background: white; }
          .print-actions { display: none; }
          .sheet { width: auto; min-height: auto; margin: 0; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button onclick="window.print()">Cetak / Simpan PDF</button>
        <button class="secondary" onclick="window.close()">Tutup</button>
      </div>
      <main class="sheet">
        <header class="report-header">
          <div class="logo-wrap">
            <img class="logo" src="${escapeHtml(logoUrl)}" alt="Bagus Bakery" onerror="this.style.display='none'">
          </div>
          <div>
            <div class="brand">Bagus Bakery</div>
            <div class="title">Laporan Bulanan</div>
          </div>
          <div class="meta">
            <div class="period-pill">${escapeHtml(report.period)}</div>
            <div>Dibuat: ${escapeHtml(generatedAt)}</div>
          </div>
        </header>

        <section class="summary-grid">
          ${pdfMetric('Total Pemasukan', formatCurrency(report.total_revenue))}
          ${pdfMetric('Persediaan Masuk', formatCurrency(report.total_expenses))}
          ${pdfMetric('Piutang', formatCurrency(report.total_unpaid))}
          ${pdfMetric('Transaksi', report.total_transactions)}
          ${pdfMetric('Kotak Terjual', report.total_boxes_sold)}
          ${pdfMetric('Produk Terlaris', report.revenue_by_product[0]?.product_name || '-')}
        </section>

        <h2 class="section-title">Breakdown Produk</h2>
        ${pdfTable(
          ['Produk', 'Kotak', 'Pendapatan', 'Kontribusi'],
          report.revenue_by_product.map((item) => [
            item.product_name,
            item.boxes,
            formatCurrency(item.revenue),
            `${item.percentage}%`
          ]),
          'Belum ada transaksi produk bulan ini.'
        )}

        <h2 class="section-title">Breakdown Persediaan Masuk</h2>
        ${pdfTable(
          ['Kategori', 'Catatan', 'Total'],
          report.expenses_by_category.map((item) => [
            item.category,
            item.count,
            formatCurrency(item.amount)
          ]),
          'Belum ada persediaan masuk bulan ini.'
        )}

        <h2 class="section-title">Estimasi Keuntungan Bersih</h2>
        ${pdfProfitSummary(report.estimated_profit)}

        <h2 class="section-title">Daftar Transaksi</h2>
        ${pdfTable(
          ['Tanggal', 'Pembeli', 'Status', 'Total'],
          transactions.map((sale) => [
            formatDate(sale.created_at),
            `${sale.buyer_name} (${sale.category || 'PENJUALAN'})`,
            paymentStatus(sale).label,
            formatCurrency(sale.total_amount)
          ]),
          'Tidak ada transaksi bulan ini.'
        )}

        <div class="footer">
          Laporan ini dibuat otomatis dari data Bagus Bakery.
        </div>
      </main>
    </body>
    </html>
  `;

  printDocumentHtml(html, {
    frameId: 'report-print-frame',
    title: 'Laporan PDF',
    successMessage: 'Laporan PDF siap disimpan'
  });
}

function printDocumentHtml(html, options = {}) {
  const frameId = options.frameId || 'print-frame';
  const title = options.title || 'Dokumen PDF';
  const successMessage = options.successMessage || 'PDF siap disimpan';
  const existingFrame = document.getElementById(frameId);
  if (existingFrame) existingFrame.remove();

  const frame = document.createElement('iframe');
  frame.id = frameId;
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.border = '0';
  frame.style.opacity = '0';
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    showToast('Export PDF gagal dibuka. Coba ulangi.', 'error');
    return;
  }

  let printed = false;
  const printFrame = () => {
    if (printed) return;
    printed = true;
    try {
      frameWindow.focus();
      frameWindow.print();
      showToast(successMessage);
      setTimeout(() => frame.remove(), 60000);
    } catch (_error) {
      frame.remove();
      showToast('Export PDF gagal dibuka. Coba ulangi.', 'error');
    }
  };

  frame.addEventListener('load', () => setTimeout(printFrame, 250), { once: true });
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  setTimeout(printFrame, 900);
}

function pdfMetric(label, value) {
  return `
    <article class="metric">
      <p class="label">${escapeHtml(label)}</p>
      <p class="value">${escapeHtml(value)}</p>
    </article>
  `;
}

function pdfTable(headers, rows, emptyMessage) {
  if (!rows.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${row.map((cell, index) => `<td class="${index === row.length - 1 ? 'amount' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function pdfProfitSummary(profit) {
  if (!profit.has_calculation_data) {
    return '<p>Simpan kalkulasi resep di halaman Kalkulator untuk melihat estimasi keuntungan bersih.</p>';
  }
  return `
    <div class="profit-box">
      <div><span>Pemasukan Lunas</span><strong>${formatCurrency(profit.total_revenue_paid)}</strong></div>
      <div><span>Modal Produksi</span><strong>${formatCurrency(profit.estimated_cogs)}</strong></div>
      <div><span>Untung Bersih</span><strong>${formatCurrency(profit.net_profit)}</strong></div>
      <div><span>Margin</span><strong>${profit.margin_percent}%</strong></div>
    </div>
  `;
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => formatCurrency(ctx.raw)
        }
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => Number(value) >= 1000 ? `${Number(value) / 1000}rb` : value
        },
        grid: { color: '#EAD9C8' }
      },
      x: {
        grid: { display: false }
      }
    }
  };
}

async function route() {
  renderLoading();
  try {
    await refreshCommon();
    renderShell();
    const hash = window.location.hash || '#dashboard';
    if (!window.location.hash) window.location.hash = hash;
    if (hash === '#tagihan') renderDebts();
    else if (hash === '#belanja') renderExpenses();
    else if (hash === '#kas') renderCash();
    else if (hash === '#kalkulator') renderCalculator();
    else if (hash === '#laporan') await renderReports();
    else if (hash === '#pengaturan') {
      window.location.hash = '#dashboard';
      return;
    }
    else renderDashboard();
  } catch (error) {
    app.innerHTML = emptyState(error.message);
    showToast(error.message, 'error');
  }
}

window.addEventListener('hashchange', route);
route();
