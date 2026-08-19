import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Printer, Cloud, History } from 'lucide-react';
import { fetchOrders, fetchSupabaseOrders, updateOrder, deleteOrder, syncFromSupabase as syncFromSupabaseApi } from '../lib/api';
import { isLocal } from '../lib/supabase';

interface OrderItem {
  name?: string;
  productName?: string;
  quantity?: number;
  price?: number;
}

interface Order {
  id: string;
  date: string;
  items: OrderItem[];
  total: number;
  clientName: string;
  clientPhone: string;
  notes: string;
  status: string;
  deliveryType?: string;
}

interface PedidosWebProps {
  onRefresh: () => void;
}

const formatMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const formatDate = (iso: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const escapeHtml = (v: any): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function printOrder(o: Order) {
  const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
  const deliveryLabel = o.deliveryType === 'envio' ? 'Envío a domicilio' : o.deliveryType === 'retiro' ? 'Retiro en tienda' : '';
  const statusText = o.status === 'pendiente' ? 'PENDIENTE' : o.status === 'confirmado' ? 'CONFIRMADO' : 'CANCELADO';
  const win = window.open('', '_blank');
  if (!win) return;
  const itemsHtml = items.map((item: OrderItem) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#374151">${escapeHtml(item.name || item.productName || '-')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280">${escapeHtml(item.quantity || 0)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${formatMoney(item.price || 0)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-weight:600">${formatMoney((item.price || 0) * (item.quantity || 0))}</td>
    </tr>
  `).join('');
  win.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Pedido ${o.id}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #111827; background: white; padding: 20px; }
  .page { max-width: 210mm; margin: auto; }
  h1 { font-size: 18px; font-weight: 800; text-align: center; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 2px; }
  .subtitle { text-align: center; font-size: 10px; color: #6b7280; margin-bottom: 16px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .order-id { font-size: 22px; font-weight: 800; }
  .status { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: 4px; display: inline-block; }
  .status-pendiente { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
  .status-confirmado { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
  .status-cancelado { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
  .client-info { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 14px; }
  .client-info div { font-size: 11px; color: #374151; margin-bottom: 2px; }
  .client-info .label { color: #6b7280; display: inline-block; width: 80px; }
  .delivery-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #dbeafe; color: #1e40af; border: 1px solid #60a5fa; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead th { background: #111827; color: white; padding: 7px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  thead th:not(:first-child) { text-align: right; }
  .total-row { font-weight: 800; font-size: 14px; }
  .total-row td { padding: 8px; border-top: 2px solid #111827; }
  .notes { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 14px; }
  .notes h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 4px; }
  .notes p { font-size: 11px; color: #374151; }
  .footer { text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 14px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <h1>Pedido</h1>
  <div class="subtitle">Comprobante de pedido web</div>
  <div class="header">
    <div class="order-id">${escapeHtml(o.id)}</div>
    <div><span class="status status-${escapeHtml(o.status)}">${escapeHtml(statusText)}</span></div>
  </div>
  <div class="client-info">
    <div><span class="label">Cliente:</span> ${escapeHtml(o.clientName || 'Sin nombre')}</div>
    <div><span class="label">Teléfono:</span> ${escapeHtml(o.clientPhone || '-')}</div>
    <div><span class="label">Fecha:</span> ${escapeHtml(o.date)}</div>
    ${deliveryLabel ? `<div><span class="label">Entrega:</span> <span class="delivery-badge">${escapeHtml(deliveryLabel)}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th style="text-align:center">Cant</th>
        <th style="text-align:right">Precio</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right">TOTAL:</td>
        <td style="text-align:right">${formatMoney(o.total)}</td>
      </tr>
    </tfoot>
  </table>
  ${o.notes ? `<div class="notes"><h3>Notas</h3><p>${escapeHtml(o.notes)}</p></div>` : ''}
  <div class="footer">Documento generado por Nexus Lite &mdash; ${new Date().toLocaleString()}</div>
</div>
<script>window.print();</script>
</body>
</html>
  `);
  win.document.close();
}

export default function PedidosWeb({ onRefresh }: PedidosWebProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'actuales' | 'historial'>('actuales');

  const syncFromSupabaseFn = async () => {
    setSyncing(true);
    const synced = await syncFromSupabaseApi();
    if (synced > 0) load();
    setSyncing(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [localOrders, sbOrders] = await Promise.all([
        fetchOrders().catch(() => [] as Order[]),
        fetchSupabaseOrders().catch(() => [] as Order[])
      ]);
      const localIds = new Set(localOrders.map(o => o.id));
      const merged = [...localOrders, ...sbOrders.filter(o => !localIds.has(o.id))];
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(merged);
    } catch (e) { console.error('[PedidosWeb] Error fetching orders:', e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const pollId = setInterval(load, 60000);
    let sse: EventSource | null = null;
    if (isLocal()) {
      try {
        sse = new EventSource('/api/orders/subscribe');
        sse.addEventListener('new-order', () => { load(); });
        sse.onerror = () => {};
      } catch {}
    }
    return () => {
      clearInterval(pollId);
      if (sse) sse.close();
    };
  }, []);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const id = (o.id || '').toLowerCase();
    const name = (o.clientName || '').toLowerCase();
    const phone = (o.clientPhone || '').toLowerCase();
    const phoneDigits = phone.replace(/\D/g, '');
    return (!q ||
      id.includes(q) ||
      name.includes(q) ||
      phone.includes(q) ||
      (qDigits && (phoneDigits.includes(qDigits) || qDigits.endsWith(phoneDigits)))) &&
      (!filterStatus || o.status === filterStatus);
  });

  const updateStatus = async (id: string, status: string) => {
    await updateOrder(id, { status }).catch(() => {});
    load();
    onRefresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminar pedido ' + id + '?')) return;
    await deleteOrder(id).catch(() => {});
    load();
    onRefresh();
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'pendiente': return <Clock size={14} className="text-amber-400" />;
      case 'confirmado': return <CheckCircle size={14} className="text-emerald-400" />;
      case 'cancelado': return <XCircle size={14} className="text-red-400" />;
      default: return null;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'pendiente': return 'bg-amber-900/30 text-amber-300 border-amber-700';
      case 'confirmado': return 'bg-emerald-900/30 text-emerald-300 border-emerald-700';
      case 'cancelado': return 'bg-red-900/30 text-red-300 border-red-700';
      default: return 'bg-slate-800 text-slate-400 border-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-black text-white flex items-center gap-2">
          <ShoppingCart size={20} className="text-[#A63A42]" /> Pedidos Web
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-8 pr-3 text-xs text-white w-48 focus:outline-none focus:border-[#A63A42]"
              placeholder="N° pedido, nombre o teléfono"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmado">Confirmado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer" title="Recargar">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={syncFromSupabaseFn} disabled={syncing} className="flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-colors disabled:opacity-50 cursor-pointer" title="Sincronizar pedidos desde Supabase (nube)">
            <Cloud size={13} className={syncing ? 'animate-pulse' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync Nube'}
          </button>
          <button onClick={() => setView(view === 'historial' ? 'actuales' : 'historial')} className={'flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-all cursor-pointer border ' + (view === 'historial' ? 'bg-[#A63A42] text-white border-[#A63A42]' : 'bg-[#181a20] text-slate-300 border-[#2d3444] hover:border-[#A63A42] hover:text-white')} title="Ver historial de pedidos">
            <History size={13} />
            {view === 'historial' ? 'Actuales' : 'Historial'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Cargando pedidos...</div>
      ) : view === 'historial' ? (
        <div className="bg-[#111318] border border-[#2d3444] rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Pedidos</div>
              <div className="text-white font-bold text-lg">{filtered.length}</div>
            </div>
            <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Recaudado</div>
              <div className="text-white font-bold text-lg">{formatMoney(filtered.reduce((a, o) => a + (Number(o.total) || 0), 0))}</div>
            </div>
            <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Pendientes</div>
              <div className="text-amber-300 font-bold text-lg">{filtered.filter(o => o.status === 'pendiente').length}</div>
            </div>
            <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Confirmados</div>
              <div className="text-emerald-300 font-bold text-lg">{filtered.filter(o => o.status === 'confirmado').length}</div>
            </div>
            <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Cancelados</div>
              <div className="text-red-300 font-bold text-lg">{filtered.filter(o => o.status === 'cancelado').length}</div>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No hay pedidos en el historial {filterStatus ? 'con ese estado' : ''}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-500 border-b border-[#2d3444]">
                    <th className="text-left py-1 pr-2">Pedido</th>
                    <th className="text-left px-2">Fecha</th>
                    <th className="text-left px-2">Cliente</th>
                    <th className="text-left px-2">Teléfono</th>
                    <th className="text-left px-2">Entrega</th>
                    <th className="text-right px-2">Total</th>
                    <th className="text-left pl-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id} className="border-b border-[#1a1d24] hover:bg-[#181a20]">
                      <td className="py-1.5 pr-2 text-white font-semibold">{o.id}</td>
                      <td className="px-2 text-slate-400">{formatDate(o.date)}</td>
                      <td className="px-2 text-slate-300">{o.clientName || 'Sin cliente'}</td>
                      <td className="px-2 text-slate-400">{o.clientPhone || '-'}</td>
                      <td className="px-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${o.deliveryType === 'envio' ? 'bg-blue-900/30 text-blue-300 border border-blue-700' : 'bg-amber-900/30 text-amber-300 border border-amber-700'}`}>{o.deliveryType === 'envio' ? 'Envío' : 'Retiro'}</span>
                      </td>
                      <td className="text-right px-2 text-white font-medium">{formatMoney(o.total)}</td>
                      <td className="pl-2"><span className={'text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 w-fit ' + statusColor(o.status)}>{statusIcon(o.status)} {o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">No hay pedidos {filterStatus ? 'con ese estado' : ''}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
            return (
              <div key={o.id} className="bg-[#111318] border border-[#2d3444] rounded-xl p-4 hover:border-[#3a445a] transition-all">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{o.id}</span>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ' + statusColor(o.status)}>
                        {statusIcon(o.status)} {o.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {o.date} — {o.clientName || 'Sin cliente'} {o.clientPhone ? '— ' + o.clientPhone : ''}
                    </div>
                    {o.notes && <div className="text-[11px] text-slate-500 italic">Nota: {o.notes}</div>}
                    {o.deliveryType && <div className="text-[11px] mt-1"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${o.deliveryType === 'envio' ? 'bg-blue-900/30 text-blue-300 border border-blue-700' : 'bg-amber-900/30 text-amber-300 border border-amber-700'}`}>{o.deliveryType === 'envio' ? 'Envío a domicilio' : 'Retiro en tienda'}</span></div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-white font-bold text-base">{formatMoney(o.total)}</div>
                    <div className="text-[10px] text-slate-500">{items.length} items</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => updateStatus(o.id, 'confirmado')}
                    disabled={o.status === 'confirmado'}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 border border-emerald-800 hover:bg-emerald-800/40 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    <CheckCircle size={12} className="inline mr-1" />Confirmar
                  </button>
                  <button
                    onClick={() => updateStatus(o.id, 'cancelado')}
                    disabled={o.status === 'cancelado'}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-red-900/30 text-red-300 border border-red-800 hover:bg-red-800/40 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    <XCircle size={12} className="inline mr-1" />Cancelar
                  </button>
                  <button
                    onClick={() => updateStatus(o.id, 'pendiente')}
                    disabled={o.status === 'pendiente'}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-900/30 text-amber-300 border border-amber-800 hover:bg-amber-800/40 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    <Clock size={12} className="inline mr-1" />Pendiente
                  </button>
                  <button
                    onClick={() => printOrder(o)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/30 text-indigo-300 border border-indigo-800 hover:bg-indigo-800/40 transition-all cursor-pointer"
                  >
                    <Printer size={12} className="inline mr-1" />PDF
                  </button>
                  <button
                    onClick={() => remove(o.id)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:bg-red-900/30 hover:text-red-300 transition-all cursor-pointer ml-auto"
                  >
                    <Trash2 size={12} className="inline mr-1" />Eliminar
                  </button>
                </div>

                <details className="mt-2">
                  <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300 select-none">Ver items</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-500 border-b border-[#2d3444]">
                          <th className="text-left py-1 pr-2">Producto</th>
                          <th className="text-right px-2">Cant</th>
                          <th className="text-right px-2">Precio</th>
                          <th className="text-right pl-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: OrderItem, i: number) => (
                          <tr key={i} className="border-b border-[#1a1d24]">
                            <td className="py-1 pr-2 text-slate-300">{item.name || item.productName || '-'}</td>
                            <td className="text-right px-2 text-slate-400">{item.quantity || 0}</td>
                            <td className="text-right px-2 text-slate-400">{formatMoney(item.price || 0)}</td>
                            <td className="text-right pl-2 text-white font-medium">{formatMoney((item.price || 0) * (item.quantity || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}