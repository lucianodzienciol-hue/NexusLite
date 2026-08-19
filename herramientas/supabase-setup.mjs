#!/usr/bin/env node
// supabase-setup.mjs — crea las tablas en Supabase, aplica RLS mínimo y carga los datos del SQLite local.
// Uso: node herramientas/supabase-setup.mjs
// Requiere .env en la raíz con: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, PROJECT_REF
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.db');
const ENV_FILE = path.join(ROOT, '.env');

// ---------- .env loader ----------
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const l of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, PROJECT_REF } = process.env;
const required = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, PROJECT_REF };
for (const [k, v] of Object.entries(required)) {
  if (!v) { console.error(`Falta ${k} en .env`); process.exit(1); }
}

// ---------- Management API ----------
async function runSql(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL error ${r.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return []; }
}

const esc = s => String(s ?? '').replace(/'/g, "''");
const jsonLit = v => "'" + esc(JSON.stringify(v)) + "'::jsonb";
const numLit = v => (v === null || v === undefined || v === '') ? 'NULL' : String(Number(v));

// ---------- Schema ----------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Varios',
  source text DEFAULT 'local',
  description text DEFAULT '',
  image text DEFAULT '',
  oferta integer DEFAULT 0,
  nuevo integer DEFAULT 0,
  web_desc text DEFAULT '',
  oferta_price numeric DEFAULT 0,
  ficha_tecnica text DEFAULT '',
  ficha_tecnica_file text DEFAULT ''
);
CREATE TABLE IF NOT EXISTS web_categories (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS web_services (
  id text PRIMARY KEY,
  name text NOT NULL,
  "desc" text DEFAULT '',
  icon text DEFAULT '',
  price numeric DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb
);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date timestamptz DEFAULT now(),
  client_name text DEFAULT '',
  client_phone text DEFAULT '',
  items jsonb,
  total numeric DEFAULT 0,
  notes text DEFAULT '',
  status text DEFAULT 'nuevo',
  delivery_type text DEFAULT ''
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date DESC);
-- Migración: id pasa a text para poder asignar PED-XXXXXX (antes uuid de la nube).
ALTER TABLE orders ALTER COLUMN id DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE orders ALTER COLUMN id TYPE text USING id::text;
EXCEPTION WHEN others THEN NULL; END $$;
`;

const RLS_SQL = `
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY p_products_anon_read ON products FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_wc_anon_read ON web_categories FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_ws_anon_read ON web_services FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_cfg_anon_read ON app_config FOR SELECT TO anon USING (key = 'webConfig');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_orders_anon_insert ON orders FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- El web usa "Prefer: return=representation" (INSERT...RETURNING), que aplica la política SELECT.
-- Tiene que ser visible para cualquier rol (sin "TO anon") para que Realtime también
-- retransmita los INSERT al suscriptor del panel local (service_role).
DO $$ BEGIN
  CREATE POLICY p_orders_read_public ON orders FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_orders_anon_block_update ON orders FOR UPDATE TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_orders_anon_block_delete ON orders FOR DELETE TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

// Realtime: sin esto, el api-server local no recibe los INSERT de pedidos en vivo.
const REALTIME_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
`;

// Numeración correlativa: el trigger asigna PED-XXXXXX a cada pedido nuevo
// respetando webConfig.orderStartNumber (Panel Web > Maestros); los existentes no se re-numeran.
const ORDER_NUMBER_TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  start_n bigint := 1;
  max_existing bigint := 0;
  next_n bigint;
BEGIN
  IF NEW.id LIKE 'PED-%' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO cfg FROM public.app_config WHERE key = 'webConfig';
  IF cfg IS NOT NULL AND cfg->>'orderStartNumber' IS NOT NULL THEN
    BEGIN
      start_n := GREATEST(1, (cfg->>'orderStartNumber')::bigint);
    EXCEPTION WHEN OTHERS THEN start_n := 1; END;
  END IF;

  SELECT COALESCE(MAX((substring(id FROM 5))::bigint), 0) INTO max_existing
    FROM public.orders WHERE id LIKE 'PED-%';

  -- Atómico: sobre la misma fila de app_config se fija "last" = último número asignado
  -- y se retorna el siguiente calculado en la misma sentencia (línea bajo clave).
  INSERT INTO public.app_config (key, value)
    VALUES ('orderSequence', jsonb_build_object('last', start_n - 1))
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('last',
      GREATEST(
        start_n,
        (COALESCE((app_config.value->>'last')::bigint, start_n - 1)) + 1,
        max_existing + 1
      ))
  RETURNING (value->>'last')::bigint INTO next_n;

  NEW.id := 'PED-' || LPAD(next_n::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_assign_number ON public.orders;
CREATE TRIGGER trg_orders_assign_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();
`;

// ---------- Seed ----------
function readLocal() {
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  if (!fs.existsSync(DB_FILE)) throw new Error(`No existe ${DB_FILE}`);
  const db = new Database(DB_FILE, { readonly: true });
  const products = db.prepare("SELECT * FROM products WHERE source = 'web'").all();
  const categories = db.prepare('SELECT * FROM web_categories ORDER BY name').all();
  const services = db.prepare('SELECT * FROM web_services ORDER BY name').all();
  const webConfig = db.prepare("SELECT value FROM app_config WHERE key = 'webConfig'").get();
  db.close();
  return {
    products,
    categories,
    services,
    webConfig: webConfig ? JSON.parse(webConfig.value) : null,
  };
}

const PRODUCT_COLS = ['id', 'code', 'name', 'price', 'cost', 'stock', 'category', 'source', 'description', 'image', 'oferta', 'nuevo', 'web_desc', 'oferta_price', 'ficha_tecnica', 'ficha_tecnica_file'];

function mapProduct(p) {
  return {
    id: esc(p.id), code: esc(p.code), name: esc(p.name), price: numLit(p.price),
    cost: numLit(p.cost), stock: numLit(p.stock), category: esc(p.category || 'Varios'),
    source: esc(p.source || 'web'), description: esc(p.description), image: esc(p.image),
    oferta: numLit(p.oferta || 0), nuevo: numLit(p.nuevo || 0), web_desc: esc(p.webDesc),
    oferta_price: numLit(p.ofertaPrice), ficha_tecnica: esc(p.fichaTecnica), ficha_tecnica_file: esc(p.fichaTecnicaFile),
  };
}

function productUpserts(rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
  return chunks.map(chunk => {
    const values = chunk.map(p => `('${p.id}','${p.code}','${p.name}',${p.price},${p.cost},${p.stock},'${p.category}','${p.source}','${p.description}','${p.image}',${p.oferta},${p.nuevo},'${p.web_desc}',${p.oferta_price},'${p.ficha_tecnica}','${p.ficha_tecnica_file}')`).join(',\n');
    const cols = PRODUCT_COLS.join(', ');
    const update = PRODUCT_COLS.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(', ');
    return `INSERT INTO products (${cols}) VALUES\n${values}\nON CONFLICT (id) DO UPDATE SET ${update};`;
  });
}

function simpleUpserts(table, rows, colNames) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
  return chunks.map(chunk => {
    const Q = c => `"${c}"`;
  const values = chunk.map(r => `(${colNames.map(c => c === 'price' ? numLit(r.price) : "'" + esc(r[c] != null ? r[c] : '') + "'").join(', ')})`).join(',\n');
    const update = colNames.slice(1).map(c => `${Q(c)} = EXCLUDED.${Q(c)}`).join(', ');
    return `INSERT INTO ${table} (${colNames.map(Q).join(', ')}) VALUES\n${values}\nON CONFLICT (id) DO UPDATE SET ${update};`;
  });
}

// ---------- Main ----------
async function main() {
  console.log(`= Setup Supabase ${PROJECT_REF} =`);

  console.log('  [1/6] Creando tablas...');
  await runSql(SCHEMA_SQL);
  console.log('  [2/6] Aplicando RLS mínimo (anon: leer catálogo + insertar pedidos)...');
  await runSql(RLS_SQL);
  console.log('  [3/6] Habilitando Realtime (orders en supabase_realtime)...');
  await runSql(REALTIME_SQL);
  console.log('  [4/6] Numeración correlativa de pedidos (trigger PED-XXXXXX)...');
  await runSql(ORDER_NUMBER_TRIGGER_SQL);

  console.log('  [5/6] Cargando datos locales...');
  const local = readLocal();
  console.log(`    productos: ${local.products.length} · categorias: ${local.categories.length} · servicios: ${local.services.length}`);

  let ok = 0, fail = 0;
  const exec = async (label, sql) => {
    try { await runSql(sql); ok++; console.log(`    OK  ${label}`); }
    catch (e) { fail++; console.log(`    ERR ${label}: ${e.message}`); }
  };

  const mapped = local.products.map(mapProduct);
  for (const [i, sql] of productUpserts(mapped).entries()) await exec(`products (lote ${i + 1})`, sql);
  if (local.categories.length) for (const sql of simpleUpserts('web_categories', local.categories, ['id', 'name'])) await exec('web_categories', sql);
  if (local.services.length) for (const sql of simpleUpserts('web_services', local.services, ['id', 'name', 'desc', 'icon', 'price'])) await exec('web_services', sql);
  if (local.webConfig) {
    await exec('app_config webConfig', `INSERT INTO app_config (key, value) VALUES ('webConfig', ${jsonLit(local.webConfig)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`);
  }

  console.log('  [6/6] Verificación por REST (anon key)...');
  const anon = SUPABASE_URL + '/rest/v1/';
  const key = process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const q = async path => (await (await fetch(anon + path, { headers: h })).json());
  try {
    const prods = await q('products?select=id,name&limit=3');
    const cats = await q('web_categories?select=id&limit=100');
    const cfg = await q('app_config?key=eq.webConfig&select=value');
    const ords = await q('orders?select=id&limit=5');
    console.log(`    products: ${prods.length} ejemplos: ${prods.map(p => p.name).join(' | ').slice(0, 90)}`);
    console.log(`    web_categories: ${cats.length} filas (anon puede leer)`);
    const cfgJson = (cfg[0] && cfg[0].value) || {};
    console.log(`    app_config webConfig: ${cfgJson.siteTitle ? 'leido OK (' + cfgJson.siteTitle + ')' : 'presente'}`);
    console.log(`    orders existentes: ${ords.length}`);
  } catch (e) {
    console.log(`    ERROR verificando: ${e.message}`);
  }

  console.log('');
  if (fail === 0) console.log('Setup completado. Tablas creadas y datos cargados en Supabase.');
  else console.log(`Setup terminado con ${fail} error(es).`);
}

main().catch(e => { console.error('Fallo:', e.message); process.exit(1); });