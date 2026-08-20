'use strict';

const SUPABASE_URL = 'https://rjtoqsyrxvtipacnxdld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdG9xc3lyeHZ0aXBhY254ZGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODI4MjIsImV4cCI6MjEwMjY1ODgyMn0.Uhdn0hqF6-LnLM-E4BU249hf6HU3pTv2_NkhYQiE9-g';

const STATUS_LABELS = { nuevo: 'Nuevo', confirmado: 'Confirmado', entregado: 'Entregado', cancelado: 'Cancelado' };

let allOrders = [];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeNum(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function fmtMoney(n) {
  return '$' + safeNum(n).toLocaleString('es-AR');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function waNum(phone) {
  return String(phone == null ? '' : phone).replace(/[^0-9]/g, '');
}

function parseItems(o) {
  try {
    const raw = JSON.parse(o.items || '[]');
    if (Array.isArray(raw)) return raw;
  } catch {}
  if (typeof o.items === 'string' && o.items.trim()) return [{ name: o.items.trim(), quantity: 1, price: o.total || 0 }];
  return [];
}

function statusClass(s) {
  const k = String(s || '').toLowerCase();
  return ['nuevo', 'confirmado', 'entregado', 'cancelado'].includes(k) ? k : 'nuevo';
}

function statusLabel(s) {
  const k = String(s || '').toLowerCase();
  return STATUS_LABELS[k] || esc(s) || 'Nuevo';
}

function setLastUpdate() {
  document.getElementById('lastUpdate').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setCount(list) {
  document.getElementById('countBar').textContent = list.length + ' pedido' + (list.length === 1 ? '' : 's');
}

function render(list) {
  const el = document.getElementById('list');
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="empty">No hay pedidos.</div>';
    return;
  }
  el.innerHTML = list.map((o) => {
    const items = parseItems(o);
    const rows = items.map((it) => {
      const qty = safeNum(it.quantity || it.qty || 1);
      const price = safeNum(it.price);
      return `<div class="item-row"><span class="item-name">${esc(it.name || '')}</span><span class="item-qty">x${qty}</span><span class="item-sub">${fmtMoney(price * qty)}</span></div>`;
    }).join('');
    const phone = waNum(o.client_phone);
    const addressMatch = String(o.notes || '').match(/Direcci[oó]n:\s*([^|]+)/i);
    const direccion = addressMatch ? addressMatch[1].trim() : '';
    const wa = phone ? `<a class="wa-link" href="https://wa.me/${phone}" target="_blank" rel="noopener" title="Escribir a ${esc(o.client_name || '')}">WhatsApp</a>` : '';
    return `
      <article class="card">
        <header class="card-head">
          <span class="order-id">${esc(o.id || '')}</span>
          <span class="badge ${statusClass(o.status)}">${statusLabel(o.status)}</span>
        </header>
        <div class="card-meta">${esc(fmtDate(o.date))}</div>
        <div class="card-client">
          <span class="client-name">${esc(o.client_name || 'Cliente sin nombre')}</span>
          <div class="client-phone">${esc(o.client_phone || '')} ${wa}</div>
        </div>
        <div class="items-wrap">${rows}</div>
        ${direccion ? `<div class="direccion">Direcci&oacute;n: ${esc(direccion)}</div>` : ''}
        ${o.notes && !addressMatch ? `<div class="notas">${esc(o.notes)}</div>` : ''}
        ${o.delivery_type ? `<div class="entrega">Entrega: ${esc(o.delivery_type)}</div>` : ''}
        <footer class="card-foot">
          <span class="total">Total: <b>${fmtMoney(o.total)}</b></span>
        </footer>
      </article>
    `;
  }).join('');
}

function applyFilter() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const clearBtn = document.getElementById('clearSearch');
  clearBtn.hidden = !q;
  if (!q) {
    setCount(allOrders);
    render(allOrders);
    return;
  }
  const filtered = allOrders.filter((o) =>
    String(o.client_name || '').toLowerCase().includes(q) ||
    String(o.client_phone || '').toLowerCase().includes(q) ||
    String(o.id || '').toLowerCase().includes(q) ||
    String(o.total || '').includes(q) ||
    String(o.notes || '').toLowerCase().includes(q)
  );
  setCount(filtered);
  render(filtered);
}

function showError(msg) {
  document.getElementById('list').innerHTML = `<div class="empty">${esc(msg)}<br/><button class="retry-btn" onclick="loadOrders()">Reintentar</button></div>`;
}

function setLoading() {
  const el = document.getElementById('list');
  if (!allOrders.length && !el.querySelector('.card')) {
    el.innerHTML = '<div class="empty">Cargando pedidos...</div>';
  }
}

async function loadOrders() {
  setLoading();
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/orders?select=*&order=date.desc&limit=200', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    const data = await r.json();
    allOrders = Array.isArray(data) ? data : [];
    setLastUpdate();
    applyFilter();
    document.getElementById('offlineBanner').hidden = true;
  } catch (err) {
    if (allOrders.length === 0) {
      showError('No se pudieron cargar los pedidos.');
    } else {
      document.getElementById('offlineBanner').hidden = false;
    }
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => { loadOrders(); });
document.getElementById('searchInput').addEventListener('input', applyFilter);
document.getElementById('clearSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  applyFilter();
});

window.addEventListener('online', () => loadOrders());
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').hidden = false;
});

setInterval(() => {
  if (!document.hidden) loadOrders();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadOrders();
});

loadOrders();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}