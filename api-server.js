import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname);
const DB_FILE = path.join(ROOT, 'database.db');
const WEB_DIR = path.resolve(__dirname, 'web');
const DIST_DIR = path.resolve(__dirname, 'dist');
const BACKUPS_DIR = path.resolve(ROOT, 'backups');
const PORT = parseInt(process.env.PORT || '4051', 10);
const IS_STANDALONE = process.env.STANDALONE === 'true';

// Minimal .env loader (no dependency)
function loadEnv() {
  try {
    const p = path.join(ROOT, '.env');
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    console.error('[API] Error loading .env:', e.message);
  }
}
loadEnv();

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let db = null;
const sseClients = [];

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(msg);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_FILE, {});
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (e) {
    console.error('[API] Error loading better-sqlite3:', e.message);
    return null;
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// ============ SECURITY ============
const SESSION_NAME = 'nexus_session';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function hmac(val) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(val).digest('hex');
}

function getCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function hasValidSession(req) {
  const raw = getCookies(req.headers.cookie || '')[SESSION_NAME];
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return false;
  const token = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!token || !sig) return false;
  const expected = hmac(token);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  const val = token + '.' + hmac(token);
  res.setHeader('Set-Cookie', SESSION_NAME + '=' + val + '; HttpOnly; SameSite=Strict; Path=/');
}

function setSessionIfMissing(req, res) {
  if (!hasValidSession(req)) setSession(res);
}

// In-memory rate limiter (simple, per-IP)
const rateBuckets = new Map();
function rateLimit(opts) {
  return (req, res, next) => {
    const key = (req.ip || req.socket?.remoteAddress || 'local') + '|' + req.path;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + opts.windowMs };
    if (bucket.resetAt <= now) { bucket.count = 0; bucket.resetAt = now + opts.windowMs; }
    bucket.count++;
    if (bucket.count > opts.max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intente más tarde.' });
    }
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > 10000) rateBuckets.clear();
    next();
  };
}

const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];

// Security headers + DNS-rebinding protection (server is local-only)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const hostname = (req.headers.host || '').split(':')[0].toLowerCase();
  if (!ALLOWED_HOSTS.includes(hostname)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
});

// CORS: allow the storefront (deployed on GitHub Pages / configured web origin)
// to POST orders to this local server, otherwise the browser blocks the request.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4050',
  'http://127.0.0.1:4050',
  'https://malcriadodevinos-bot.github.io'
]);
function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  const cfg = getConfig('companyConfig', {});
  for (const u of [cfg.domain, cfg.webUrl]) {
    if (u) {
      try { if (new URL(u).origin === origin) return true; } catch {}
    }
  }
  return false;
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Issue the admin session cookie on non-API (page/assets) requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  setSessionIfMissing(req, res);
  next();
});

// API gate: everything under /api requires a session unless explicitly public
const PUBLIC_API_PATHS = new Set(['/api/web-data']);
app.use('/api', (req, res, next) => {
  const full = req.baseUrl + req.path;
  if (req.method === 'POST' && full === '/api/orders') return next();
  if (PUBLIC_API_PATHS.has(full) && req.method === 'GET') return next();
  if (hasValidSession(req)) return next();
  return res.status(401).json({ error: 'No autorizado' });
});

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error('[API] Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============ SCHEMA & SEED ============
function ensureSchema() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Varios',
      source TEXT DEFAULT 'local',
      description TEXT DEFAULT '',
      image TEXT DEFAULT '',
      oferta INTEGER DEFAULT 0,
      nuevo INTEGER DEFAULT 0,
      webDesc TEXT DEFAULT '',
      ofertaPrice REAL DEFAULT 0,
      fichaTecnica TEXT DEFAULT '',
      fichaTecnicaFile TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      document TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '-',
      email TEXT DEFAULT '-'
    );
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      ruc TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '-',
      email TEXT DEFAULT '-'
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      requiresCash INTEGER DEFAULT 0,
      icon TEXT DEFAULT '',
      adjustment REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT NOT NULL DEFAULT 'Efectivo',
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT 'Cliente General',
      cashReceived REAL DEFAULT 0,
      change REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId TEXT NOT NULL,
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      providerId TEXT DEFAULT '',
      providerName TEXT DEFAULT '',
      paymentMethod TEXT DEFAULT 'Efectivo',
      total REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseId TEXT NOT NULL,
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'transferencia',
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS repairs (
      id TEXT PRIMARY KEY,
      code TEXT,
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      clientPhone TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      marca TEXT DEFAULT '',
      modelo TEXT DEFAULT '',
      status TEXT DEFAULT 'recibido',
      price REAL DEFAULT 0,
      problem TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      date TEXT NOT NULL,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS web_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS web_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      price REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS restock_pending (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS monthly_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      totalSales REAL DEFAULT 0,
      totalCosts REAL DEFAULT 0,
      totalExpenses REAL DEFAULT 0,
      totalPurchases REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      status TEXT DEFAULT 'recibido',
      date TEXT NOT NULL,
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT DEFAULT '',
      date TEXT NOT NULL,
      category TEXT DEFAULT ''
    );
  `);
}

function seedIfEmpty() {
  const d = getDb();
  const webCount = d.prepare("SELECT COUNT(*) as c FROM products WHERE source = 'web'").get();
  if (webCount.c > 0) return;

  const cats = [
    { id: '1', name: 'General' },
    { id: '2', name: 'Alimentos' },
    { id: '3', name: 'Bebidas' },
    { id: '4', name: 'Hogar' },
  ];
  const insCat = d.prepare('INSERT OR IGNORE INTO web_categories (id, name) VALUES (?,?)');
  for (const c of cats) insCat.run(c.id, c.name);

  const prods = [
    { id: '1', code: 'GEN001', name: 'Artículo de Ejemplo 1', price: 1000, cost: 600, stock: 20, category: 'General', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo1/400/400' },
    { id: '2', code: 'GEN002', name: 'Artículo de Ejemplo 2', price: 1500, cost: 900, stock: 15, category: 'General', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo2/400/400' },
    { id: '3', code: 'ALI001', name: 'Artículo de Ejemplo 3', price: 2000, cost: 1200, stock: 25, category: 'Alimentos', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo3/400/400' },
    { id: '4', code: 'ALI002', name: 'Artículo de Ejemplo 4', price: 2500, cost: 1500, stock: 18, category: 'Alimentos', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo4/400/400' },
    { id: '5', code: 'BEB001', name: 'Artículo de Ejemplo 5', price: 3000, cost: 1800, stock: 22, category: 'Bebidas', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo5/400/400' },
    { id: '6', code: 'BEB002', name: 'Artículo de Ejemplo 6', price: 3500, cost: 2100, stock: 16, category: 'Bebidas', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo6/400/400' },
    { id: '7', code: 'HOG001', name: 'Artículo de Ejemplo 7', price: 4000, cost: 2400, stock: 20, category: 'Hogar', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo7/400/400' },
    { id: '8', code: 'HOG002', name: 'Artículo de Ejemplo 8', price: 4500, cost: 2700, stock: 14, category: 'Hogar', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo8/400/400' },
  ];
  const ins = d.prepare(`INSERT INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,0,'','')`);
  for (const p of prods) {
    ins.run(p.id, p.code, p.name, p.price, p.cost, p.stock, p.category, 'web', p.desc, p.image, p.desc);
  }

  const pmts = [
    { id: 'pm1', name: 'Efectivo', requiresCash: 1, adjustment: 0 },
    { id: 'pm2', name: 'Tarjeta', requiresCash: 0, adjustment: 0 },
    { id: 'pm3', name: 'Transferencia', requiresCash: 0, adjustment: 0 },
  ];
  const insPmt = d.prepare('INSERT OR IGNORE INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,\'\',?)');
  for (const pm of pmts) insPmt.run(pm.id, pm.name, pm.requiresCash, pm.adjustment);

  const cl = { id: 'c1', document: '99999999', name: 'Cliente General', phone: '-', email: 'general@nexuspos.com' };
  d.prepare('INSERT OR IGNORE INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)').run(cl.id, cl.document, cl.name, cl.phone, cl.email);

  console.log('[API] Base de datos inicializada con productos de ejemplo');
}

ensureSchema();
seedIfEmpty();

// Migrate: add stock images to products without image
try {
  const d = getDb();
  const IMG_MAP = {
    'General': 'https://picsum.photos/seed/ejemplo1/400/400',
    'Alimentos': 'https://picsum.photos/seed/ejemplo3/400/400',
    'Bebidas': 'https://picsum.photos/seed/ejemplo5/400/400',
    'Hogar': 'https://picsum.photos/seed/ejemplo7/400/400',
  };
  const missing = d.prepare("SELECT id, category FROM products WHERE image IS NULL OR image = ''").all();
  const upd = d.prepare('UPDATE products SET image = ? WHERE id = ?');
  for (const row of missing) {
    const img = IMG_MAP[row.category] || 'https://picsum.photos/seed/ejemplo1/400/400';
    upd.run(img, row.id);
  }
  if (missing.length > 0) console.log(`[API] Imágenes asignadas a ${missing.length} productos`);
} catch (e) { console.log('[API] Migración de imágenes:', e.message); }

// ============ PRODUCTS ============
function cleanStr(v, max) {
  return String(v || '').slice(0, max);
}

app.get('/api/products', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM products ORDER BY name').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/products', (req, res) => {
  try {
    const p = req.body || {};
    if (p.id !== undefined && (typeof p.id !== 'string' || p.id.length > 100)) return res.status(400).json({ error: 'ID inválido' });
    const id = p.id || Date.now().toString();
    getDb().prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, cleanStr(p.code, 100), cleanStr(p.name, 300), Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0,
      cleanStr(p.category, 100), p.source === 'web' ? 'web' : 'local', cleanStr(p.desc, 5000), cleanStr(p.image, 2000),
      p.oferta ? 1 : 0, p.nuevo ? 1 : 0, cleanStr(p.webDesc, 5000), Number(p.ofertaPrice) || 0,
      cleanStr(p.fichaTecnica, 2000), cleanStr(p.fichaTecnicaFile, 2000)
    );
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/products/:id', (req, res) => {
  try {
    if (!req.params.id || req.params.id.length > 100) return res.status(400).json({ error: 'ID inválido' });
    const p = req.body || {};
    const existing = getDb().prepare('SELECT source FROM products WHERE id=?').get(req.params.id);
    const source = p.source === 'web' ? 'web' : p.source === 'local' ? 'local' : (existing ? existing.source : 'web');
    getDb().prepare(`UPDATE products SET code=?, name=?, price=?, cost=?, stock=?, category=?, source=?, description=?, image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=?, fichaTecnica=?, fichaTecnicaFile=? WHERE id=?`).run(
      cleanStr(p.code, 100), cleanStr(p.name, 300), Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0,
      cleanStr(p.category, 100), source, cleanStr(p.desc, 5000), cleanStr(p.image, 2000),
      p.oferta ? 1 : 0, p.nuevo ? 1 : 0, cleanStr(p.webDesc, 5000), Number(p.ofertaPrice) || 0,
      cleanStr(p.fichaTecnica, 2000), cleanStr(p.fichaTecnicaFile, 2000), req.params.id
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    if (!req.params.id || req.params.id.length > 100) return res.status(400).json({ error: 'ID inválido' });
    getDb().prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/products/bulk-price-update', (req, res) => {
  try {
    const pct = Number(req.body.percentage) || 0;
    const factor = 1 + pct / 100;
    const rows = getDb().prepare('SELECT * FROM products').all();
    let count = 0;
    for (const r of rows) {
      let newPrice = Math.round(r.price * factor);
      newPrice = Math.max(500, Math.min(1000, newPrice));
      getDb().prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, r.id);
      count++;
    }
    res.json({ success: true, count });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ WEB DATA ============
app.get('/api/web-data', (req, res) => {
  try {
    const d = getDb();
    const dbProducts = d.prepare("SELECT * FROM products WHERE source = 'web'").all();
    const clients = d.prepare('SELECT * FROM clients').all();
    const repairs = d.prepare('SELECT * FROM repairs ORDER BY date DESC').all();
    const services = d.prepare('SELECT * FROM web_services ORDER BY name').all();
    const config = getConfig('webConfig', {});
    const companyCfg = getConfig('companyConfig', {});
    const categories = d.prepare('SELECT * FROM web_categories ORDER BY name').all();
    res.json({ products: dbProducts, clients, repairs, services, config: { ...config, supabaseUrl: companyCfg.supabaseUrl || '', supabaseKey: companyCfg.supabaseKey || '' }, categories });
  } catch { res.json({ products: [], clients: [], repairs: [], services: [], config: {}, categories: [] }); }
});

app.post('/api/web-save', (req, res) => {
  try {
    const data = req.body;
    const d = getDb();
    const upsertProduct = d.prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const delCats = d.prepare('DELETE FROM web_categories');
    const insCat = d.prepare('INSERT INTO web_categories (id, name) VALUES (?,?)');
    const delSvcs = d.prepare('DELETE FROM web_services');
    const insSvc = d.prepare('INSERT INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)');
    d.transaction(() => {
      for (const p of (data.products || [])) {
        upsertProduct.run(p.id, p.code || '', p.name || '', Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0, p.category || 'Varios', 'web', p.desc || p.webDesc || '', p.image || '', p.oferta ? 1 : 0, p.nuevo ? 1 : 0, p.webDesc || p.desc || '', Number(p.ofertaPrice) || 0, p.fichaTecnica || '', p.fichaTecnicaFile || '');
      }
      delCats.run();
      for (const c of (data.categories || [])) { insCat.run(c.id, c.name || ''); }
      delSvcs.run();
      for (const s of (data.services || [])) { insSvc.run(s.id, s.name || '', s.desc || '', s.icon || '', Number(s.price) || 0); }
      if (data.config) setConfig('webConfig', data.config);
    })();
    res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Error interno del servidor' }); }
});

// ============ NOTES ============
app.get('/api/notes', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM notes ORDER BY date DESC').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/notes', (req, res) => {
  try {
    const n = req.body;
    const id = Date.now().toString();
    getDb().prepare('INSERT INTO notes (id, title, content, date, category) VALUES (?,?,?,?,?)').run(
      id, n.title || '', n.content || '', new Date().toISOString(), n.category || 'General'
    );
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/notes/:id', (req, res) => {
  try {
    const n = req.body;
    getDb().prepare('UPDATE notes SET title=?, content=?, category=? WHERE id=?').run(
      n.title || '', n.content || '', n.category || 'General', req.params.id
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/notes/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ BACKUPS ============
app.get('/api/backups', (req, res) => {
  try {
    const backupsDir = BACKUPS_DIR;
    if (!fs.existsSync(backupsDir)) { fs.mkdirSync(backupsDir, { recursive: true }); return res.json([]); }
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db') || f.endsWith('.json')).map(f => {
      const stat = fs.statSync(path.join(backupsDir, f));
      const ext = path.extname(f);
      const base = f.replace(ext, '');
      return {
        base,
        date: stat.birthtime.toISOString().replace('T', ' ').slice(0, 19),
        hasJson: ext === '.json',
        hasDb: ext === '.db',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Deduplicate by base name
    const seen = new Set();
    const deduped = files.filter((f) => {
      if (seen.has(f.base)) return false;
      seen.add(f.base);
      return true;
    });
    res.json(deduped);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/backups/create', (req, res) => {
  try {
    const d = getDb();
    const data = {};
    const tables = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'repairs', 'web_categories', 'web_services', 'notes', 'orders', 'app_config', 'restock_pending', 'monthly_stats', 'exchanges', 'site_visits'];
    for (const t of tables) {
      try { data[t] = d.prepare(`SELECT * FROM ${t}`).all(); } catch { data[t] = []; }
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(BACKUPS_DIR, `backup-${timestamp}.json`);
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log(`[API] Backup creado: ${backupFile}`);
    res.json({ success: true, file: `backup-${timestamp}.json` });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/backups/restore', (req, res) => {
  try {
    const { base } = req.body;
    const dbFile = path.join(BACKUPS_DIR, base + '.db');
    const jsonFile = path.join(BACKUPS_DIR, base + '.json');
    if (fs.existsSync(dbFile)) {
      getDb().close();
      db = null;
      fs.copyFileSync(dbFile, DB_FILE);
      getDb();
      res.json({ success: true });
    } else if (fs.existsSync(jsonFile)) {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
      restoreFromJson(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Backup no encontrado' });
    }
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ COMPANY CONFIG ============
function maskSecret(s) {
  if (!s || typeof s !== 'string') return s;
  if (s.length <= 8) return '****';
  return '****' + s.slice(-4);
}

function isMasked(v) {
  return typeof v === 'string' && v.startsWith('****');
}

app.get('/api/company-config', (req, res) => {
  try {
    const config = getConfig('companyConfig', {});
    const out = { ...config };
    if (out.githubToken) out.githubToken = maskSecret(out.githubToken);
    if (out.serviceRoleKey) out.serviceRoleKey = maskSecret(out.serviceRoleKey);
    res.json(Object.keys(out).length > 0 ? out : null);
  } catch { res.json(null); }
});

app.put('/api/company-config', rateLimit({ windowMs: 60000, max: 20 }), (req, res) => {
  try {
    const existing = getConfig('companyConfig', {});
    const updated = { ...existing, ...req.body };
    if (isMasked(updated.githubToken)) delete updated.githubToken;
    if (isMasked(updated.serviceRoleKey)) delete updated.serviceRoleKey;
    setConfig('companyConfig', updated);
    const out = { ...updated };
    if (out.githubToken) out.githubToken = maskSecret(out.githubToken);
    if (out.serviceRoleKey) out.serviceRoleKey = maskSecret(out.serviceRoleKey);
    res.json(out);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ CASH REGISTER ============
app.get('/api/cash-register', (req, res) => {
  try {
    const cr = getConfig('cashRegister', { cash: 0, bank: 0 });
    res.json(cr);
  } catch { res.json({ cash: 0, bank: 0 }); }
});

app.put('/api/cash-register', (req, res) => {
  try {
    setConfig('cashRegister', req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ SUPABASE ORDERS SYNC ============
function getSupabaseCreds() {
  const cfg = getConfig('companyConfig', {});
  return {
    url: cfg.supabaseUrl || '',
    serviceKey: SERVICE_ROLE_KEY || cfg.serviceRoleKey || '',
    anonKey: cfg.supabaseKey || '',
  };
}

async function fetchCloudOrders() {
  const { url, serviceKey, anonKey } = getSupabaseCreds();
  const key = serviceKey || anonKey;
  if (!url || !key) return [];
  const r = await fetch(url + '/rest/v1/orders?select=*&order=date.desc', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  if (!r.ok) return [];
  return r.json();
}

function mapCloudOrder(o) {
  return {
    id: String(o.id ?? ('sb-' + Date.now())),
    date: o.date || new Date().toISOString(),
    items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
    total: Number(o.total) || 0,
    clientName: o.client_name || o.clientName || '',
    clientPhone: o.client_phone || o.clientPhone || '',
    notes: o.notes || '',
    status: o.status || 'nuevo',
    deliveryType: o.delivery_type || o.deliveryType || '',
  };
}

async function syncCloudOrders() {
  try {
    const orders = await fetchCloudOrders();
    const d = getDb();
    let synced = 0;
    for (const o of orders) {
      const id = mapCloudOrder(o).id;
      const existing = d.prepare('SELECT id FROM orders WHERE id = ?').get(id);
      if (existing) continue;
      const m = mapCloudOrder(o);
      d.prepare(`INSERT INTO orders (id, clientName, clientPhone, items, total, notes, deliveryType, status, date) VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, m.clientName, m.clientPhone, typeof m.items === 'string' ? m.items : JSON.stringify(m.items), m.total, m.notes, m.deliveryType, m.status, m.date
      );
      synced++;
    }
    if (synced > 0) console.log('[API] Sync nube: ' + synced + ' pedido(s) importado(s)');
    return synced;
  } catch (e) {
    console.error('[API] Sync nube falló:', e.message);
    return 0;
  }
}

function initSupabaseRealtime() {
  try {
    const { url, serviceKey } = getSupabaseCreds();
    if (!url || !serviceKey) {
      console.log('[API] Realtime deshabilitado: se requiere SUPABASE_SERVICE_ROLE_KEY (env) o Service Role Key en Supabase del panel.');
      return;
    }
    const client = createClient(url, serviceKey, { auth: { persistSession: false } });
    client
      .channel('nexus-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        try {
          const o = payload.new;
          if (!o || !o.id) return;
          const d = getDb();
          const id = String(o.id);
          if (d.prepare('SELECT id FROM orders WHERE id = ?').get(id)) return;
          const m = mapCloudOrder(o);
          d.prepare(`INSERT INTO orders (id, clientName, clientPhone, items, total, notes, deliveryType, status, date) VALUES (?,?,?,?,?,?,?,?,?)`).run(
            id, m.clientName, m.clientPhone, typeof m.items === 'string' ? m.items : JSON.stringify(m.items), m.total, m.notes, m.deliveryType, m.status, m.date
          );
          const fresh = { ...m, source: 'supabase' };
          broadcastSSE('new-order', fresh);
          console.log('[API] Realtime: pedido nuevo de la nube', id);
        } catch (e) {
          console.error('[API] Realtime: error procesando INSERT:', e.message);
        }
      })
      .subscribe((status) => {
        console.log('[API] Realtime:', status);
        if (status === 'SUBSCRIBED') syncCloudOrders().catch(() => {});
      });
  } catch (e) {
    console.error('[API] Realtime: error al inicializar:', e.message);
  }
}

app.get('/api/orders/supabase', async (req, res) => {
  try {
    const orders = await fetchCloudOrders();
    res.json(orders);
  } catch { res.json([]); }
});

app.post('/api/orders/sync-from-supabase', async (req, res) => {
  const synced = await syncCloudOrders();
  res.json({ synced });
});

// ============ SYNC STATUS & MISC ============
app.get('/api/auto-sync-status', (req, res) => {
  res.json({ pending: false, syncing: false, lastSync: null, error: null });
});

app.get('/api/status', (req, res) => {
  try {
    const d = getDb();
    const counts = {};
    const tables = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'purchases', 'expenses', 'repairs', 'web_categories', 'web_services', 'notes', 'orders'];
    for (const t of tables) {
      try { counts[t] = (d.prepare(`SELECT COUNT(*) as c FROM ${t}`).get()).c; } catch { counts[t] = 0; }
    }
    res.json({
      pid: process.pid,
      ppid: process.ppid,
      uptime: formatUptime(process.uptime()),
      uptimeSeconds: process.uptime(),
      memory: {
        rss: formatBytes(process.memoryUsage().rss),
        heapTotal: formatBytes(process.memoryUsage().heapTotal),
        heapUsed: formatBytes(process.memoryUsage().heapUsed),
      },
      nodeVersion: process.version,
      platform: process.platform,
      dbSize: fs.existsSync(DB_FILE) ? formatBytes(fs.statSync(DB_FILE).size) : '0 B',
      dbSizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
      counts,
      children: [],
      gitRemote: 'local',
      lastSync: null,
    });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/backup', (req, res) => {
  try {
    const d = getDb();
    const data = {};
    const tables = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'repairs', 'web_categories', 'web_services', 'notes', 'orders', 'app_config', 'restock_pending', 'monthly_stats', 'exchanges', 'site_visits'];
    for (const t of tables) {
      try { data[t] = d.prepare(`SELECT * FROM ${t}`).all(); } catch { data[t] = []; }
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.json"`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/restore', rateLimit({ windowMs: 60000, max: 5 }), (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    restoreFromJson(req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/backups/encrypted', (req, res) => {
  res.json([]);
});

app.post('/api/backups/restore-encrypted', (req, res) => {
  res.status(400).json({ error: 'No hay backups encriptados disponibles' });
});

app.post('/api/backups/restore-last', (req, res) => {
  res.status(400).json({ error: 'No hay backups disponibles' });
});

app.post('/api/sync-full', (req, res) => {
  res.json({ success: true, message: 'Sync no disponible en modo Lite' });
});

app.get('/api/download-app', (req, res) => {
  res.json({ success: false, error: 'Descarga no disponible en modo Lite' });
});

app.post('/api/deploy-ghpages', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  try {
    const { token, repo } = req.body;
    if (!repo) return res.status(400).json({ success: false, error: 'Repositorio requerido' });
    const stored = getConfig('companyConfig', {});
    const effectiveToken = (token && token.startsWith('****')) ? (stored.githubToken || '') : (token || '');
    if (!effectiveToken) return res.status(400).json({ success: false, error: 'Token de GitHub requerido' });

    const api = 'https://api.github.com';
    const headers = { Authorization: `Bearer ${effectiveToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-lite' };

    // 0. Validate token permissions
    const userResp = await fetch(`${api}/user`, { headers });
    if (!userResp.ok) return res.status(400).json({ success: false, error: 'Token inválido. Generá un nuevo token en GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, con permisos de "Contents: write" sobre el repositorio.' });
    const userData = await userResp.json();
    console.log('[deploy] Authenticated as:', userData.login);

    // 1. Get repo and verify write access
    const repoResp = await fetch(`${api}/repos/${repo}`, { headers });
    if (repoResp.status === 403) return res.status(400).json({ success: false, error: 'El token no tiene acceso al repositorio. Necesitás un Fine-grained token con permisos "Contents: write" sobre "' + repo + '".' });
    if (!repoResp.ok) return res.status(400).json({ success: false, error: 'Repositorio no encontrado: ' + repo });
    const repoData = await repoResp.json();
    const defaultBranch = repoData.default_branch;

    const refResp = await fetch(`${api}/repos/${repo}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refResp.ok) return res.status(400).json({ success: false, error: 'No se pudo obtener la rama por defecto' });
    const refData = await refResp.json();
    const baseSha = refData.object.sha;

    // 2. Build tree from web/ directory + admin/ (dist/)
    const BINARY_EXTS = new Set(['.jpeg', '.jpg', '.png', '.gif', '.ico', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf']);
    const files = [];
    function walkDir(dir, prefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) walkDir(full, rel);
        else {
          const ext = path.extname(entry.name).toLowerCase();
          const isBinary = BINARY_EXTS.has(ext);
          files.push({
            path: rel,
            content: isBinary ? fs.readFileSync(full).toString('base64') : fs.readFileSync(full, 'utf-8'),
            ...(isBinary ? { encoding: 'base64' } : {}),
          });
        }
      }
    }
    if (!fs.existsSync(WEB_DIR)) return res.status(400).json({ success: false, error: 'No se encontró el directorio web/' });
    walkDir(WEB_DIR, '');
    if (fs.existsSync(DIST_DIR)) walkDir(DIST_DIR, 'admin');

    // Generate data.json with current web data
    try {
      const d = getDb();
      const dbProducts = d.prepare("SELECT * FROM products WHERE source = 'web'").all();
      const categories = d.prepare('SELECT * FROM web_categories ORDER BY name').all();
      const services = d.prepare('SELECT * FROM web_services ORDER BY name').all();
      const config = getConfig('webConfig', {});
      const companyCfg = getConfig('companyConfig', {});
      const webData = { products: dbProducts, categories, services, config, supabaseUrl: companyCfg.supabaseUrl || '', supabaseKey: companyCfg.supabaseKey || '', whatsapp: companyCfg.whatsapp || '' };
      files.push({ path: 'data.json', content: JSON.stringify(webData) });
    } catch (e) {
      console.error('[deploy] Error generating data.json:', e.message);
    }

    const treeItems = files.map(f => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      content: f.content,
      ...(f.encoding ? { encoding: f.encoding } : {}),
    }));

    const treeResp = await fetch(`${api}/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree: treeItems }),
    });
    if (!treeResp.ok) {
      const treeErr = await treeResp.text().catch(() => '');
      console.error('[deploy] Tree error:', treeResp.status, treeErr);
      const msg = treeResp.status === 403
        ? 'El token no tiene permisos de escritura. Necesitás un Fine-grained token con "Contents: write" sobre el repositorio. Creá uno en GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, Repository access: ' + repo + ', Permissions: Contents: write.'
        : 'Error al crear el tree: ' + (treeErr || treeResp.statusText);
      return res.status(500).json({ success: false, error: msg });
    }
    const treeData = await treeResp.json();
    const treeSha = treeData.sha;

    // 3. Create commit (orphan, no parent)
    const commitResp = await fetch(`${api}/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Deploy Nexus Lite Web', tree: treeSha, parents: [] }),
    });
    if (!commitResp.ok) return res.status(500).json({ success: false, error: 'Error al crear el commit' });
    const commitData = await commitResp.json();
    const commitSha = commitData.sha;

    // 4. Update gh-pages branch
    const ghResp = await fetch(`${api}/repos/${repo}/git/refs/heads/gh-pages`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force: true }),
    });
    if (!ghResp.ok) {
      // Try creating the branch if it doesn't exist
      const createResp = await fetch(`${api}/repos/${repo}/git/refs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/gh-pages', sha: commitSha }),
      });
      if (!createResp.ok) return res.status(500).json({ success: false, error: 'Error al crear la rama gh-pages' });
    }

    // 5. Enable GitHub Pages (optional)
    await fetch(`${api}/repos/${repo}/pages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }),
    }).catch(() => {});

    res.json({ success: true, url: `https://${repo.toLowerCase().replace('/', '.github.io/')}/` });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/import-from-web', (req, res) => {
  res.json({ success: true, imported: 0, updated: 0, message: 'Importación no disponible en modo Lite' });
});

app.get('/api/visits', (req, res) => {
  res.json({ total: 0, today: 0, lastDays: [] });
});

// ============ WEB STORE (static files) ============
app.use('/web', express.static(WEB_DIR, { maxAge: 0 }));
app.get('/web/*', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// ============ ORDERS ============
try {
  getDb().prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    clientName TEXT DEFAULT '',
    clientPhone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendiente',
    deliveryType TEXT DEFAULT ''
  )`).run();
  try { getDb().prepare("ALTER TABLE orders ADD COLUMN deliveryType TEXT DEFAULT ''").run(); } catch {}
} catch (e) { console.error('[API] Error creating orders table:', e.message); }

app.get('/api/orders/subscribe', (req, res) => {
  if (sseClients.length >= 50) {
    res.status(503).json({ error: 'Demasiadas conexiones' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { clearInterval(keepAlive); }
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.get('/api/orders', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const rows = getDb().prepare('SELECT * FROM orders ORDER BY date DESC').all();
    res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Genera el próximo número de pedido correlativo y ascendente (PED-XXXXXX).
// El número inicial se configura en Panel Web > Maestros (webConfig.orderStartNumber).
function nextOrderId() {
  const d = getDb();
  const cfg = getConfig('webConfig', {});
  let start = parseInt(cfg.orderStartNumber, 10);
  if (!(start >= 1)) start = 1;
  const state = getConfig('orderSequence', null);
  let last = state && Number.isFinite(state.last) ? state.last : start - 1;
  const maxExisting = d.prepare("SELECT id FROM orders WHERE id LIKE 'PED-%'").all()
    .reduce((m, r) => {
      const n = parseInt(String(r.id).replace('PED-', ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, start - 1);
  const next = Math.max(start, last + 1, maxExisting + 1);
  if (next < 0 || next > 999999999) return 'PED-' + Date.now().toString().slice(-9);
  setConfig('orderSequence', { last: next });
  return 'PED-' + String(next).padStart(6, '0');
}

app.post('/api/orders', rateLimit({ windowMs: 60000, max: 30 }), (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const total = Number(body.total) || 0;
    const clientName = String(body.clientName || '').slice(0, 200);
    const clientPhone = String(body.clientPhone || '').slice(0, 60);
    const notes = String(body.notes || '').slice(0, 2000);
    const deliveryType = String(body.deliveryType || '').slice(0, 20);
    const id = nextOrderId();
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    getDb().prepare('INSERT INTO orders (id, date, items, total, clientName, clientPhone, notes, status, deliveryType) VALUES (?,?,?,?,?,?,?,?,?)').run(
      id, date, JSON.stringify(items), total, clientName, clientPhone, notes, 'pendiente', deliveryType
    );
    const newOrder = { id, date, items, total, clientName, clientPhone, notes, status: 'pendiente', deliveryType };
    broadcastSSE('new-order', newOrder);
    res.status(201).json(newOrder);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    const { status, clientName, clientPhone, notes, deliveryType } = req.body;
    getDb().prepare('UPDATE orders SET status=?, clientName=?, clientPhone=?, notes=?, deliveryType=? WHERE id=?').run(
      status || existing.status,
      clientName !== undefined ? clientName : existing.clientName,
      clientPhone !== undefined ? clientPhone : existing.clientPhone,
      notes !== undefined ? notes : existing.notes,
      deliveryType !== undefined ? deliveryType : (existing.deliveryType || ''),
      req.params.id
    );
    const row = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json({ ...row, items: JSON.parse(row.items || '[]') });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: r.changes > 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ SPA (built files) ============
if (IS_STANDALONE && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    maxAge: '30d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`[API] Sirviendo SPA desde ${DIST_DIR}`);
}

// ============ HELPERS ============
const SCHEMA_COLUMNS = {
  products: ['id', 'code', 'name', 'price', 'cost', 'stock', 'category', 'source', 'description', 'image', 'oferta', 'nuevo', 'webDesc', 'ofertaPrice', 'fichaTecnica', 'fichaTecnicaFile'],
  clients: ['id', 'document', 'name', 'phone', 'email'],
  providers: ['id', 'ruc', 'name', 'phone', 'email'],
  payment_methods: ['id', 'name', 'requiresCash', 'icon', 'adjustment'],
  sales: ['id', 'date', 'total', 'paymentMethod', 'clientId', 'clientName', 'cashReceived', 'change'],
  sale_items: ['id', 'saleId', 'productId', 'productName', 'quantity', 'price'],
  purchases: ['id', 'date', 'providerId', 'providerName', 'paymentMethod', 'total'],
  purchase_items: ['id', 'purchaseId', 'productId', 'productName', 'quantity', 'cost'],
  expenses: ['id', 'date', 'type', 'description', 'amount'],
  repairs: ['id', 'code', 'clientId', 'clientName', 'clientPhone', 'equipment', 'marca', 'modelo', 'status', 'price', 'problem', 'notes', 'date', 'updatedAt'],
  web_categories: ['id', 'name'],
  web_services: ['id', 'name', 'desc', 'icon', 'price'],
  notes: ['id', 'title', 'content', 'date', 'category'],
  orders: ['id', 'date', 'items', 'total', 'clientName', 'clientPhone', 'notes', 'status', 'deliveryType'],
  app_config: ['key', 'value'],
  restock_pending: ['id', 'productId', 'productName', 'quantity', 'notes'],
  monthly_stats: ['id', 'month', 'totalSales', 'totalCosts', 'totalExpenses', 'totalPurchases'],
  exchanges: ['id', 'clientId', 'clientName', 'productId', 'productName', 'status', 'date', 'notes'],
  site_visits: ['id', 'date', 'count'],
};

function getConfig(key, def = null) {
  try {
    const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : def;
  } catch { return def; }
}

function setConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)').run(key, JSON.stringify(value));
}

function restoreFromJson(data) {
  const d = getDb();
  const tables = Object.keys(SCHEMA_COLUMNS);
  d.transaction(() => {
    for (const t of tables) {
      try { d.prepare(`DELETE FROM ${t}`).run(); } catch {}
    }
    for (const t of tables) {
      const rows = data[t];
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;
      const allowed = SCHEMA_COLUMNS[t];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const keys = Object.keys(row).filter(k => allowed.indexOf(k) !== -1);
        if (keys.length === 0) continue;
        const vals = keys.map(k => row[k]);
        try {
          d.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
        } catch {}
      }
    }
  })();
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}



function startServer(port, cb) {
  const srv = app.listen(port, '0.0.0.0', cb);
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[API] Puerto ${port} ocupado, liberando...`);
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (e, stdout) => {
        if (stdout) {
          const parts = stdout.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid) {
            try { process.kill(parseInt(pid)); } catch {}
            setTimeout(() => startServer(port, cb), 1000);
            return;
          }
        }
        console.log(`[API] No se pudo liberar el puerto ${port}, usando puerto ${port + 1}`);
        startServer(port + 1, cb);
      });
    } else {
      console.error('[API] Error al iniciar servidor:', err.message);
      process.exit(1);
    }
  });
}

startServer(PORT, () => {
  console.log(`=========================================`);
  console.log(`  Nexus Lite - API Server`);
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Base de datos: ${DB_FILE}`);
  console.log(`  Tienda Web: http://localhost:${PORT}/web/`);
  console.log(`=========================================`);
  initSupabaseRealtime();
  setInterval(() => { syncCloudOrders().catch(() => {}); }, 5 * 60 * 1000).unref();
  if (IS_STANDALONE && process.env.BROWSER !== 'none') {
    setTimeout(() => {
      exec(`start http://localhost:${PORT}`, (err) => {
        if (err) console.log('[API] No se pudo abrir el navegador:', err.message);
      });
    }, 1000);
  }
});
