import { getSupabaseClient, isRemote } from './supabase';

function getRemoteBase(): string {
  if (typeof window === 'undefined') return '';
  const v = (window as any).__NEXUS_REMOTE_API__;
  return typeof v === 'string' ? v.replace(/\/+$/, '') : '';
}

async function localFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function localFetchRaw(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
}

async function remoteFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(getRemoteBase() + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.method === 'POST' || options?.method === 'PATCH' ? { Prefer: 'return=representation' } : {}),
      ...options?.headers,
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export interface Order {
  id: string;
  date: string;
  items: any[];
  total: number;
  clientName: string;
  clientPhone: string;
  notes: string;
  status: string;
  deliveryType?: string;
}

function mapOrder(o: any): Order {
  return {
    id: o.id?.toString() || '',
    date: o.date || '',
    items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
    total: Number(o.total) || 0,
    clientName: o.client_name || o.clientName || '',
    clientPhone: o.client_phone || o.clientPhone || '',
    notes: o.notes || '',
    status: o.status || 'pendiente',
    deliveryType: o.delivery_type || o.deliveryType || '',
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const base = getRemoteBase();
  if (base) {
    const data = await remoteFetch<any[]>('/rest/v1/orders?select=*&order=date.desc');
    return (data || []).map(mapOrder);
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) return [];
    const { data, error } = await sb.from('orders').select('*').order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrder);
  }
  return localFetch<Order[]>('/api/orders');
}

export async function updateOrder(id: string, data: Partial<Order>): Promise<void> {
  const base = getRemoteBase();
  if (base) {
    const body: any = {
      client_name: data.clientName,
      client_phone: data.clientPhone,
      notes: data.notes,
      status: data.status,
      delivery_type: data.deliveryType,
    };
    if (data.items !== undefined) body.items = typeof data.items === 'string' ? data.items : JSON.stringify(data.items);
    if (data.total !== undefined) body.total = data.total;
    const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    await remoteFetch(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
    return;
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase not initialized');
    const { error } = await sb.from('orders').update({
      client_name: data.clientName,
      client_phone: data.clientPhone,
      notes: data.notes,
      status: data.status,
      delivery_type: data.deliveryType,
    }).eq('id', id);
    if (error) throw error;
    return;
  }
  await localFetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteOrder(id: string): Promise<void> {
  const base = getRemoteBase();
  if (base) {
    await remoteFetch(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase not initialized');
    const { error } = await sb.from('orders').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  await localFetch(`/api/orders/${id}`, { method: 'DELETE' });
}

export async function fetchSupabaseOrders(): Promise<Order[]> {
  const base = getRemoteBase();
  if (base) return fetchOrders();
  if (isRemote()) return fetchOrders();
  try {
    const raw = await localFetch<any[]>('/api/orders/supabase');
    return (raw || []).map(mapOrder);
  } catch {
    return [];
  }
}

export async function syncFromSupabase(): Promise<number> {
  if (isRemote()) return 0;
  try {
    const r = await localFetch<{ synced: number }>('/api/orders/sync-from-supabase', { method: 'POST' });
    return r.synced || 0;
  } catch {
    return 0;
  }
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  image?: string;
  description?: string;
  webDesc?: string;
  oferta?: number;
  ofertaPrice?: number;
  nuevo?: number;
  stock?: number;
  code?: string;
  cost?: number;
  source?: string;
}

function mapProduct(p: any): Product {
  return {
    id: p.id?.toString() || '',
    name: p.name || '',
    price: Number(p.price) || 0,
    category: p.category || '',
    image: p.image || '',
    description: p.description || '',
    webDesc: p.web_desc || p.webDesc || '',
    oferta: p.oferta || 0,
    ofertaPrice: Number(p.oferta_price || p.ofertaPrice || 0),
    nuevo: p.nuevo || 0,
    stock: Number(p.stock || 0),
    code: p.code || '',
    cost: Number(p.cost || 0),
    source: p.source || 'web',
  };
}

function productRecord(product: Product): any {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    category: product.category,
    image: product.image || '',
    description: product.description || '',
    web_desc: product.webDesc || '',
    oferta: product.oferta || 0,
    oferta_price: product.ofertaPrice || 0,
    nuevo: product.nuevo || 0,
    stock: product.stock || 0,
    code: product.code || '',
    cost: product.cost || 0,
    source: product.source || 'web',
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const base = getRemoteBase();
  if (base) {
    const data = await remoteFetch<any[]>('/rest/v1/products?select=*');
    return (data || []).map(mapProduct);
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) return [];
    const { data, error } = await sb.from('products').select('*');
    if (error) throw error;
    return (data || []).map(mapProduct);
  }
  return localFetch<Product[]>('/api/products');
}

export async function saveProduct(product: Product): Promise<void> {
  const base = getRemoteBase();
  if (base) {
    await remoteFetch('/rest/v1/products?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify([productRecord(product)]),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return;
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase not initialized');
    const { error } = await sb.from('products').upsert(productRecord(product), { onConflict: 'id' });
    if (error) throw error;
    return;
  }
  const method = product.id ? 'PUT' : 'POST';
  await localFetch(`/api/products${product.id ? '/' + product.id : ''}`, { method, body: JSON.stringify(product) });
}

export async function deleteProduct(id: string): Promise<void> {
  const base = getRemoteBase();
  if (base) {
    await remoteFetch(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase not initialized');
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  await localFetch(`/api/products/${id}`, { method: 'DELETE' });
}

export interface WebConfig {
  banners?: any[];
  popupActive?: boolean;
  popupText?: string;
  popupImage?: string;
  popupDelay?: number;
  popupDuration?: number;
  popupAlways?: boolean;
  companyName?: string;
  siteTitle?: string;
  phone?: string;
  email?: string;
  hours?: string;
  address?: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  metaDescription?: string;
  showOffersButton?: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
  adminPin?: string;
  categories?: any[];
  [key: string]: any;
}

function getDataJsonUrl(): string {
  if (isRemote()) {
    const basePath = window.location.pathname.replace(/\/admin\/.*$/, '');
    return basePath + '/data.json';
  }
  return 'data.json';
}

async function remoteWebConfig(): Promise<WebConfig> {
  const base = getRemoteBase();
  if (base) {
    try {
      const data = await remoteFetch<any[]>('/rest/v1/settings?key=eq.companyConfig&select=value');
      const v = data?.[0]?.value;
      if (v) {
        const parsed = JSON.parse(v);
        if (typeof parsed === 'object') return { ...parsed };
      }
    } catch {}
  }
  return {};
}

export async function fetchWebConfig(): Promise<WebConfig> {
  const base = getRemoteBase();
  if (base) return remoteWebConfig();
  if (isRemote()) {
    try {
      const r = await fetch(getDataJsonUrl());
      if (r.ok) {
        const d = await r.json();
        return { ...(d.config || {}), supabaseUrl: d.supabaseUrl || '', supabaseKey: d.supabaseKey || '', whatsapp: d.whatsapp || '' };
      }
    } catch {}
    return {};
  }
  try {
    return await localFetch<WebConfig>('/api/company-config');
  } catch {
    return {};
  }
}

export async function saveWebConfig(config: WebConfig): Promise<void> {
  const base = getRemoteBase();
  if (base) {
    await remoteFetch('/rest/v1/settings?on_conflict=key', {
      method: 'POST',
      body: JSON.stringify([{ key: 'companyConfig', value: JSON.stringify(config) }]),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return;
  }
  if (isRemote()) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase not initialized');
    const { error } = await sb.from('settings').upsert({ key: 'companyConfig', value: JSON.stringify(config) }, { onConflict: 'key' });
    if (error) throw error;
    return;
  }
  await localFetch('/api/company-config', { method: 'POST', body: JSON.stringify(config) });
}

export async function fetchWebData(): Promise<{ products: Product[]; categories: any[]; config: WebConfig }> {
  const base = getRemoteBase();
  if (base) {
    let products: any[] = [];
    try { products = await remoteFetch<any[]>('/rest/v1/products?select=*'); } catch {}
    const config = await remoteWebConfig();
    return {
      products: (products || []).map(mapProduct),
      categories: config.categories || [],
      config,
    };
  }
  if (isRemote()) {
    try {
      const r = await fetch(getDataJsonUrl());
      if (r.ok) {
        const d = await r.json();
        return {
          products: d.products || [],
          categories: d.categories || [],
          config: { ...(d.config || {}), supabaseUrl: d.supabaseUrl || '', supabaseKey: d.supabaseKey || '', whatsapp: d.whatsapp || '' },
        };
      }
    } catch {}
    return { products: [], categories: [], config: {} };
  }
  return localFetch('/api/web-data');
}