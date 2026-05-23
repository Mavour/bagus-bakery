const app = document.getElementById('app');
const bottomNav = document.getElementById('bottom-nav');
const sidebarNav = document.getElementById('sidebar-nav');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const toastWrap = document.getElementById('toast-wrap');

const defaultNavLabels = ['Dashboard', 'Tagihan', 'Belanja', 'Kalkulator', 'Laporan'];
const icons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z"/></svg>',
  bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Zm3 5h7M10 12h7M10 16h4"/></svg>',
  expense: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h15l-2 11H7L5 4H2M9 11h8M10 15h6M9 21a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1ZM18 21a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/></svg>',
  calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 4h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
  report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h14M9 16v-5M13 16V8M17 16v-8"/></svg>'
};
const navItems = [
  { hash: '#dashboard', icon: icons.home },
  { hash: '#tagihan', icon: icons.bill },
  { hash: '#belanja', icon: icons.expense },
  { hash: '#kalkulator', icon: icons.calc },
  { hash: '#laporan', icon: icons.report }
];

const state = {
  products: [],
  sales: [],
  expenses: [],
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
  const [products, sales, expenses, calculations, settings] = await Promise.all([
    api('/api/products'),
    api('/api/sales?limit=500'),
    api('/api/expenses?limit=500'),
    api('/api/calculations'),
    api('/api/settings')
  ]);
  state.products = products;
  state.sales = sales;
  state.expenses = expenses;
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
    todayRevenue: todaysSales.filter((sale) => sale.status === 'paid').reduce((sum, sale) => sum + sale.total_amount, 0),
    monthRevenue: monthSales.filter((sale) => sale.status === 'paid').reduce((sum, sale) => sum + sale.total_amount, 0),
    monthExpensesTotal,
    todayTransactions: todaysSales.length,
    unpaidTotal: state.sales.filter((sale) => sale.status === 'unpaid').reduce((sum, sale) => sum + sale.total_amount, 0)
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
      .filter((sale) => sale.status === 'paid' && String(sale.created_at).startsWith(key))
      .reduce((sum, sale) => sum + sale.total_amount, 0));
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
      <div class="list">
        ${recentSales.length ? recentSales.map(saleItem).join('') : emptyState('Belum ada transaksi.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-sale"]').addEventListener('click', showSaleModal);
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
  const paid = sale.status === 'paid';
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(sale.buyer_name)}</p>
          <p class="item-meta">${itemSummary(sale.items)}</p>
          <p class="item-meta">${formatDate(sale.created_at)}</p>
        </div>
        <div>
          <span class="badge ${paid ? 'success' : 'danger'}">${paid ? 'Lunas' : 'Belum'}</span>
          <p class="item-meta" style="text-align:right">${formatCurrency(sale.total_amount)}</p>
        </div>
      </div>
    </article>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function productOptions(selected = '') {
  return state.products.map((product) => `
    <option value="${product.id}" ${String(product.id) === String(selected) ? 'selected' : ''}>
      ${escapeHtml(product.name)}
    </option>
  `).join('');
}

function showSaleModal() {
  openModal('Catat Penjualan Baru', `
    <form class="form-grid" id="sale-form">
      <div class="field">
        <label for="buyer-name">Nama pembeli</label>
        <input id="buyer-name" name="buyer_name" required autocomplete="name">
      </div>
      <div id="sale-items" class="form-grid"></div>
      <button class="btn secondary" type="button" id="add-sale-item">+ Tambah Produk</button>
      <div class="summary-box">
        <div class="summary-line"><span>Total harga</span><strong id="sale-total">Rp0</strong></div>
      </div>
      <div class="field">
        <label for="sale-status">Status pembayaran</label>
        <select id="sale-status" name="status">
          <option value="paid">Lunas</option>
          <option value="unpaid">Belum Bayar</option>
        </select>
      </div>
      <div class="field">
        <label for="sale-notes">Catatan</label>
        <textarea id="sale-notes" name="notes" rows="3"></textarea>
      </div>
      <button class="btn" type="submit">Simpan</button>
    </form>
  `);

  const list = document.getElementById('sale-items');
  const addButton = document.getElementById('add-sale-item');
  const form = document.getElementById('sale-form');
  const total = document.getElementById('sale-total');

  function addRow(productId = state.products[0]?.id) {
    const product = state.products.find((item) => String(item.id) === String(productId)) || state.products[0];
    const row = document.createElement('div');
    row.className = 'item-editor';
    row.innerHTML = `
      <div class="field">
        <label>Produk</label>
        <select class="sale-product" required>${productOptions(product?.id)}</select>
      </div>
      <div class="field">
        <label>Jumlah</label>
        <input class="sale-qty" type="number" min="1" value="1" required>
      </div>
      <div class="field">
        <label>Harga/kotak</label>
        <input class="sale-price" type="number" min="0" value="${product?.price_per_box || 0}" required>
      </div>
      <button class="icon-button remove-row" type="button" aria-label="Hapus">x</button>
    `;
    list.appendChild(row);
    row.querySelector('.sale-product').addEventListener('change', (event) => {
      const selected = state.products.find((item) => String(item.id) === event.target.value);
      row.querySelector('.sale-price').value = selected?.price_per_box || 0;
      updateTotal();
    });
    row.querySelectorAll('input, select').forEach((field) => field.addEventListener('input', updateTotal));
    row.querySelector('.remove-row').addEventListener('click', () => {
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
      await api('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          buyer_name: document.getElementById('buyer-name').value,
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

  addRow();
}

function renderDebts() {
  let filter = 'all';
  draw();

  function filteredUnpaid() {
    const now = new Date();
    return state.sales.filter((sale) => {
      if (sale.status !== 'unpaid') return false;
      if (filter === 'week') return daysBetween(sale.created_at) <= 7;
      if (filter === 'month') return String(sale.created_at).startsWith(monthKey(now));
      return true;
    });
  }

  function draw() {
    const unpaid = filteredUnpaid();
    const paid = state.sales.filter((sale) => sale.status === 'paid');
    const total = unpaid.reduce((sum, sale) => sum + sale.total_amount, 0);
    app.innerHTML = `
      <h1 class="page-title">Bon / Tagihan</h1>
      <p class="page-subtitle">Pantau semua pesanan yang belum dibayar.</p>

      <div class="grid stats-grid">
        ${statCard('Total piutang', formatCurrency(total), total > 0)}
        ${statCard('Bon outstanding', `${unpaid.length}`)}
      </div>

      <section class="section">
        <div class="section-header">
          <h2>Belum Dibayar</h2>
          <div class="segmented" id="debt-filter">
            <button type="button" data-filter="all" class="${filter === 'all' ? 'active' : ''}">Semua</button>
            <button type="button" data-filter="week" class="${filter === 'week' ? 'active' : ''}">7 hari</button>
            <button type="button" data-filter="month" class="${filter === 'month' ? 'active' : ''}">Bulan ini</button>
          </div>
        </div>
        <div class="list">
          ${unpaid.length ? unpaid.map(debtItem).join('') : emptyState('Tidak ada bon outstanding.')}
        </div>
      </section>

      <details class="section card panel">
        <summary class="compact-title">Riwayat bon lunas</summary>
        <div class="list" style="margin-top:14px">
          ${paid.length ? paid.map(saleItem).join('') : emptyState('Belum ada bon lunas.')}
        </div>
      </details>
    `;
    app.querySelectorAll('#debt-filter button').forEach((button) => {
      button.addEventListener('click', () => {
        filter = button.dataset.filter;
        draw();
      });
    });
    app.querySelectorAll('[data-pay-id]').forEach((button) => button.addEventListener('click', markPaid));
  }
}

function debtItem(sale) {
  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <p class="item-title">${escapeHtml(sale.buyer_name)}</p>
          <p class="item-meta">${itemSummary(sale.items)}</p>
          <p class="item-meta">${formatDate(sale.created_at)} - ${daysBetween(sale.created_at)} hari tertunggak</p>
        </div>
        <strong>${formatCurrency(sale.total_amount)}</strong>
      </div>
      <div class="button-row">
        <button class="btn success" type="button" data-pay-id="${sale.id}">Tandai Lunas</button>
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
      <div class="list">
        ${state.expenses.length ? state.expenses.map(expenseItem).join('') : emptyState('Belum ada catatan belanja.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-expense"]').addEventListener('click', () => showExpenseModal());
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
  if (!window.confirm('Tandai bon ini sebagai lunas?')) return;
  try {
    await api(`/api/sales/${id}/pay`, { method: 'PATCH' });
    showToast('Bon ditandai lunas');
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
      <div class="table-wrap">
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
      <div class="list">
        ${state.calculations.length ? state.calculations.map(calcItem).join('') : emptyState('Belum ada kalkulasi tersimpan.')}
      </div>
    </section>
  `;

  app.querySelector('[data-action="new-product"]').addEventListener('click', () => showProductModal());
  app.querySelectorAll('[data-edit-product]').forEach((button) => button.addEventListener('click', () => {
    showProductModal(state.products.find((item) => String(item.id) === button.dataset.editProduct));
  }));
  app.querySelectorAll('[data-delete-product]').forEach((button) => button.addEventListener('click', deleteProduct));
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
      <button class="btn danger" type="button" data-delete-calc="${calc.id}">Hapus</button>
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

    <div class="grid stats-grid">
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
      <div class="table-wrap">
        <table>
          <thead><tr><th>Produk</th><th>Kotak</th><th>Pendapatan</th><th>%</th></tr></thead>
          <tbody>
            ${report.revenue_by_product.length ? report.revenue_by_product.map((item) => `
              <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${item.boxes}</td>
                <td>${formatCurrency(item.revenue)}</td>
                <td>${item.percentage}%</td>
              </tr>
            `).join('') : '<tr><td colspan="4">Belum ada transaksi bulan ini.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Breakdown Persediaan Masuk</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kategori</th><th>Catatan</th><th>Total</th></tr></thead>
          <tbody>
            ${report.expenses_by_category.length ? report.expenses_by_category.map((item) => `
              <tr>
                <td>${escapeHtml(item.category)}</td>
                <td>${item.count}</td>
                <td>${formatCurrency(item.amount)}</td>
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
      <div class="button-row" style="margin-top:14px">
        <button class="btn secondary" type="button" id="export-report">Export Laporan</button>
      </div>
      <div class="list" style="margin-top:14px">
        ${state.sales.filter((sale) => String(sale.created_at).startsWith(`${year}-${String(month).padStart(2, '0')}`)).map(saleItem).join('') || emptyState('Tidak ada transaksi.')}
      </div>
    </details>
  `;

  app.querySelectorAll('[data-month-nav]').forEach((button) => button.addEventListener('click', () => {
    const next = new Date(year, month - 1 + Number(button.dataset.monthNav), 1);
    window.history.replaceState(null, '', `?year=${next.getFullYear()}&month=${next.getMonth() + 1}${window.location.hash || '#laporan'}`);
    route();
  }));
  document.getElementById('export-report').addEventListener('click', () => exportReport(report));
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

function exportReport(report) {
  const lines = [
    'Bagus Bakery',
    `Laporan: ${report.period}`,
    `Total Pemasukan: ${formatCurrency(report.total_revenue)}`,
    `Persediaan Masuk: ${formatCurrency(report.total_expenses)}`,
    `Total Transaksi: ${report.total_transactions}`,
    `Piutang: ${formatCurrency(report.total_unpaid)}`,
    '',
    'Produk,Kotak,Pendapatan,Persentase',
    ...report.revenue_by_product.map((item) => `${item.product_name},${item.boxes},${item.revenue},${item.percentage}%`)
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `laporan-${report.period.toLowerCase().replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
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
