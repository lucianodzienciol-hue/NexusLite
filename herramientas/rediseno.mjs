#!/usr/bin/env node
/**
 * Herramienta externa de rediseño del frontend Nexus Lite.
 *
 * Separa la capa visual (markup + CSS) de la capa lógica (app.js) del
 * storefront, y garantiza que un rediseño no pierda funciones mediante un
 * "contrato JS <-> HTML".
 *
 * Comandos:
 *   node herramientas/rediseno.mjs modularizar [webDir] [--force]
 *     Separa web/index.html en index.html + style.css + app.js.
 *     Idempotente: si ya está modularizado, no hace nada salvo --force.
 *
 *   node herramientas/rediseno.mjs extraer-contrato [webDir]
 *     Escanea app.js y extrae el contrato (IDs, funciones globales usadas en
 *     handlers, clases del HTML generado) y lo guarda en herramientas/contrato.json.
 *
 *   node herramientas/rediseno.mjs validar [webDir]
 *     Valida el diseño actual contra el contrato. Salida "OK" o lista de
 *     pendientes. Código de salida 0 = OK, 1 = hay fallos.
 *
 *   node herramientas/rediseno.mjs publicar [webDir] [--deploy] [--repo user/repo]
 *     Sincroniza web/ a la carpeta Malcriado Vinos, construye el panel,
 *     sincroniza dist/ y (con --deploy) publica a GitHub Pages vía el
 *     servidor local (http://localhost:4050).
 *
 *   node herramientas/rediseno.mjs analizar-imagen <imagen> [--nombre cliente]
 *     Extrae la paleta dominante de una imagen (PNG/JPG/WEBP, por ej. un
 *     mockup arrastrado desde el navegador) y genera un tema.json mapeado a
 *     los tokens :root del storefront. WEBP se convierte a PNG con Chrome.
 *
 *   node herramientas/rediseno.mjs aplicar-tema <tema.json> [webDir]
 *     Aplica los tokens de un tema.json al bloque :root de web/style.css
 *     (conserva todo lo demás del diseño).
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { decode as decodeJpeg } from 'jpeg-js';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_WEB = path.join(ROOT, 'web');
const DISENOS_DIR = path.join(__dirname, 'disenos');
const SIBLING = path.join(path.resolve(ROOT, '..'), 'Malcriado Vinos');
const CONTRACT_FILE = path.join(__dirname, 'contrato.json');
const BOM = '\uFEFF';
const NL = '\r\n';

// ---------- utilidades ----------
function readText(p) {
  return fs.readFileSync(p, 'utf-8');
}

function writeText(p, content) {
  fs.writeFileSync(p, content, 'utf-8');
}

function unique(arr) {
  return [...new Set(arr)];
}

function extractTokens(text, re, capture) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[capture]);
  return unique(out);
}

function parseArgs(argv) {
  const opts = { flags: [], positional: [] };
  for (const a of argv) {
    if (a.startsWith('--')) opts.flags.push(a.slice(2));
    else opts.positional.push(a);
  }
  return opts;
}

function robocopy(src, dst) {
  const cmd = `robocopy "${src}" "${dst}" /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1`;
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (e) {
    const code = e.status ?? -1;
    // robocopy: 0-7 = éxito, >=8 = error real
    if (code >= 8) throw new Error(`robocopy falló (código ${code})`);
  }
  console.log(`  -> sincronizado: ${path.basename(src)}`);
}

// ---------- modularizar ----------
function modularizar(webDir, force) {
  const html = path.join(webDir, 'index.html');
  if (!fs.existsSync(html)) throw new Error(`No existe ${html}`);
  const styleOut = path.join(webDir, 'style.css');
  const appOut = path.join(webDir, 'app.js');
  if (fs.existsSync(styleOut) && fs.existsSync(appOut) && !force) {
    console.log('  ya está modularizado (usá --force para rehacerlo).');
    return;
  }

  let src = readText(html);
  const hasBom = src.startsWith(BOM);
  if (hasBom) src = src.slice(1);

  const styleM = src.match(/<style>([\s\S]*?)<\/style>/i);
  if (!styleM) throw new Error('No se encontró el bloque <style>.');
  const styleCss = styleM[1];

  const scriptBlocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scriptBlocks.length === 0) throw new Error('No se encontró ningún <script> inline.');
  const appJs = scriptBlocks.map(m => m[1]).join(NL + NL);

  // Reemplazar <style> por <link>
  src = src.replace(/<style>[\s\S]*?<\/style>/i, `<link rel="stylesheet" href="style.css">`);

  // Reemplazar scripts inline por una sola referencia a app.js
  src = src.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
  src = src.replace(/<\/body>/i, `  <script src="app.js"></script>${NL}</body>`);

  writeText(styleOut, styleCss + NL);
  writeText(appOut, appJs + NL);
  writeText(html, (hasBom ? BOM : '') + src);

  console.log(`  index.html  -> markup (${src.length} chars)`);
  console.log(`  style.css   -> ${styleCss.length} chars`);
  console.log(`  app.js      -> ${appJs.length} chars`);
  console.log('  Modularizado correctamente. Las funciones viven ahora en app.js (protegida).');
}

// ---------- contrato ----------
function extraerContrato(webDir) {
  const appJs = readText(path.join(webDir, 'app.js'));
  const html = readText(path.join(webDir, 'index.html'));

  // IDs usados desde JS
  const ids = extractTokens(appJs, /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g, 1);

  // Funciones invocadas en handlers (markup estático + todo app.js: templates y concatenación)
  const handlerFns = [];
  const handlerRe = /on(?:click|change|submit|input|load|keyup|keydown|keypress)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const src of [html, appJs]) {
    for (const m of src.matchAll(handlerRe)) {
      const expr = m[1] ?? m[2];
      for (const f of expr.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) handlerFns.push(f[1]);
    }
  }
  const fns = unique(
    handlerFns.filter(n => !['if', 'for', 'while', 'function', 'return'].includes(n))
  );

  // Clases del HTML generado: scan completo de app.js (templates y concatenación),
  // limpiando interpolaciones ${...} y añadiendo classList.add/remove/toggle.
  function stripInterpolations(s) {
    let out = '';
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '$' && s[i + 1] === '{') { depth++; i++; continue; }
      if (ch === '}' && depth > 0) { depth--; continue; }
      if (depth === 0) out += ch;
    }
    return out;
  }
  const genClasses = new Set();
  for (const m of appJs.matchAll(/class\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
    stripInterpolations(m[1] ?? m[2]).split(/\s+/).forEach(c => c && genClasses.add(c));
  }
  for (const m of appJs.matchAll(/\.className\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
    stripInterpolations(m[1] ?? m[2]).split(/\s+/).forEach(c => c && genClasses.add(c));
  }
  for (const m of appJs.matchAll(/classList\.(?:add|remove|toggle)\(\s*['"]([^'"]+)['"]/g)) {
    m[1].split(/\s+/).forEach(c => c && genClasses.add(c));
  }
  for (const sel of extractTokens(appJs, /querySelector(?:All)?\(\s*['"]([^'"]+)['"]\s*\)/g, 1)) {
    for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) genClasses.add(m[1]);
  }

  const contract = {
    generado: new Date().toISOString(),
    ids,
    handlerFns: fns,
    genClasses: unique([...genClasses]),
  };
  writeText(CONTRACT_FILE, JSON.stringify(contract, null, 2) + NL);
  console.log(`  IDs JS          : ${contract.ids.length}`);
  console.log(`  funciones handler: ${contract.handlerFns.length}`);
  console.log(`  clases generadas: ${contract.genClasses.length}`);
  console.log(`  Contrato guardado en ${path.relative(ROOT, CONTRACT_FILE)}`);
  return contract;
}

// ---------- validar ----------
const BUILTINS = new Set([
  'scrollTo', 'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'encodeURIComponent', 'decodeURIComponent',
  'parseFloat', 'parseInt', 'Number', 'String', 'Boolean', 'Date', 'JSON',
  'Math', 'console', 'Object', 'Array', 'RegExp', 'document', 'window',
  'encodeURI', 'isNaN', 'Promise', 'navigator', 'URL', 'Blob', 'FileReader',
]);

function isDefined(appJs, name) {
  if (BUILTINS.has(name)) return true;
  const re = new RegExp(
    `function\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:\\(|\\w|[A-Za-z_$])`
  );
  return re.test(appJs);
}

function validar(webDir) {
  if (!fs.existsSync(CONTRACT_FILE)) {
    console.log('  No hay contrato. Generándolo...');
    extraerContrato(webDir);
  }
  const contract = JSON.parse(readText(CONTRACT_FILE));
  const html = readText(path.join(webDir, 'index.html'));
  const css = readText(path.join(webDir, 'style.css'));
  const appJs = readText(path.join(webDir, 'app.js'));

  const problems = [];
  const warnings = [];

  for (const id of contract.ids) {
    if (!new RegExp(`\\bid=["']${id}["']`).test(html)) {
      problems.push(`FALTA el ID "${id}" en el markup (app.js lo usa).`);
    }
  }

  for (const fn of contract.handlerFns) {
    if (!isDefined(appJs, fn)) {
      problems.push(`La función "${fn}" es llamada desde un handler pero no está definida en app.js.`);
    }
  }

  for (const cls of contract.genClasses) {
    if (!new RegExp(`\\.${cls}\\b`).test(css)) {
      warnings.push(`La clase generada ".${cls}" no tiene regla en style.css (puede estar estilizada por otra vía).`);
    }
  }

  const extraStyles = extractTokens(css, /\.([A-Za-z_][\w-]*)/g, 1);
  for (const cls of extraStyles) {
    const usado = contract.genClasses.includes(cls)
      || new RegExp(`class=["'][^"']*\\b${cls}\\b`).test(html)
      || new RegExp(`\\b${cls}\\b`).test(appJs);
    if (!usado) {
      warnings.push(`La clase ".${cls}" está en CSS pero no se referencia ni en markup ni en app.js (¿CSS muerto?).`);
    }
  }

  console.log('');
  console.log('== RESULTADO ==');
  if (problems.length === 0) console.log(`  [OK] Funciones protegidas. ${contract.ids.length} IDs y ${contract.handlerFns.length} funciones verificados.`);
  else {
    console.log(`  [FALLO] ${problems.length} problema(s):`);
    problems.forEach(p => console.log('   - ' + p));
  }
  if (warnings.length) {
    console.log(`  [ADVERTENCIA] ${warnings.length}:`);
    warnings.forEach(w => console.log('   * ' + w));
  }
  console.log('');

  if (problems.length) process.exitCode = 1;
}

// ---------- publicar ----------
async function publicar(webDir, flags) {
  console.log('== Sincronizando web/ -> Malcriado Vinos ==');
  const dstWeb = path.join(SIBLING, 'web');
  if (!fs.existsSync(SIBLING)) throw new Error(`No existe la carpeta hermana: ${SIBLING}`);
  robocopy(webDir, dstWeb);

  console.log('== Build del panel (vite) ==');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  const dist = path.join(ROOT, 'dist');
  const dstDist = path.join(SIBLING, 'dist');
  if (fs.existsSync(dist)) {
    console.log('== Sincronizando dist/ -> Malcriado Vinos ==');
    robocopy(dist, dstDist);
  }

  if (flags.includes('deploy')) {
    const repo = flags.find(f => f.startsWith('repo='))?.slice(5)
      || process.env.NEXUS_GH_REPO
      || 'malcriadodevinos-bot/malcriado-vinos';
    const url = 'http://localhost:4050/api/deploy-ghpages';
    console.log(`== Deploy a GitHub Pages (${repo}) vía ${url} ==`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, token: '****' }),
    });
    const data = await res.json();
    console.log('  Respuesta:', JSON.stringify(data));
    if (!data.success) throw new Error('El deploy falló: ' + (data.error || 'desconocido'));
  } else {
    console.log('  (Sugerencia: pasá --deploy para publicar a GitHub Pages.)');
  }
  console.log('Listo.');
}

// ---------- color utils ----------
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function hex([r, g, b]) { return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}
function lum([r, g, b]) { r /= 255; g /= 255; b /= 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function isDark(c) { return lum(c) < 0.45; }
function blend(a, b, t) { return a.map((x, i) => x + (b[i] - x) * t); }
function adjust(c, f) { return c.map(v => clamp(v * f)); }
function shiftL(c, delta) {
  const [h, s, l] = rgbToHsl(c);
  return hex(rgbFromHsl(h, s, Math.min(1, Math.max(0, l + delta))));
}
function rgbFromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s * 100) / 100; l = clamp(l * 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

// ---------- analizar-imagen ----------
function detectImageFormat(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'desconocido';
}

function convertToPng(src) {
  const tmp = path.join(__dirname, '.tmp_convert.png');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const chrome = process.env.CHROME_PATH
    || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
      .find(p => fs.existsSync(p));
  if (!chrome) throw new Error('No se encontró Chrome para convertir el WEBP. Instalá Chrome o guardá la imagen como PNG/JPG.');
  const fileUrl = 'file:///' + src.replace(/\\/g, '/');
  execSync(`"${chrome}" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1600 --screenshot="${tmp}" "${fileUrl}"`, { stdio: 'pipe' });
  return tmp;
}

function decodePixels(filePath, format) {
  const buf = fs.readFileSync(filePath);
  if (format === 'png') {
    const png = PNG.sync.read(buf);
    return { data: png.data, w: png.width, h: png.height };
  }
  const jpg = decodeJpeg(buf, { useTArray: true, formatAsRGBA: true });
  return { data: jpg.data, w: jpg.width, h: jpg.height };
}

function dominantPalette(data, w, h, whiteThreshold) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 8000)));
  const buckets = new Map();
  let total = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) continue;
      const key = (Math.round(r / 16) << 8) | (Math.round(g / 16) << 4) | Math.round(b / 16);
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      buckets.set(key, e);
      total++;
    }
  }
  return {
    total,
    palette: [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map(e => ({ n: e.n, avg: [e.r / e.n, e.g / e.n, e.b / e.n] })),
  };
}

// ---------- CDP: extracción de diseño (layout + fonts) ----------
function chromePath() {
  return process.env.CHROME_PATH
    || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
      .find(p => fs.existsSync(p));
}

const DISENO_SNIPPET = `
(async () => {
  try {
    if (document.readyState !== 'complete') {
      await new Promise(res => {
        const t = setTimeout(() => res(), 15000);
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'complete') { clearTimeout(t); res(); }
        });
      });
    }
    await new Promise(r => setTimeout(r, 1000));
    const R = {};
    const gcs = el => getComputedStyle(el);
    const qs = s => document.querySelector(s);
    const qsa = s => [...document.querySelectorAll(s)];
    const uniq = a => [...new Set(a)];
    const cleanFont = fam => (fam || '').split(',')[0].trim().replace(/["']/g, '');

    const step = Math.max(innerHeight - 80, 200);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 250));

    const body = gcs(document.body);
    R.fontBody = cleanFont(body.fontFamily);
    R.fontCatalog = uniq(qsa('h1,h2,h3').map(el => cleanFont(gcs(el).fontFamily))).slice(0, 4);
    R.headings = ['h1', 'h2', 'h3'].map(tag => {
      const el = qs(tag); if (!el) return null;
      const s = gcs(el);
      return { tag, size: s.fontSize, weight: s.fontWeight, family: cleanFont(s.fontFamily) };
    }).filter(Boolean).slice(0, 4);

    const btnCands = qsa('button, [role="button"], a[class*="btn"], a[class*="button"], input[type="submit"]').filter(el => {
      const r = el.getBoundingClientRect();
      return r.height >= 24 && r.height <= 120 && r.width >= 60 && r.width <= 800;
    });
    let btn = null, btnScore = -1;
    for (const el of btnCands) {
      if (el.closest('[class*="cookie"],[class*="consent"],[id*="cookie"],[id*="consent"],[class*="onetrust"],[class*="modal"],[class*="notice"],[class*="announce"]')) continue;
      const txt = String(el.textContent || '').trim();
      let s = 0;
      if (/add|comprar|agregar|cart|submit|cta|primary|pedir|pedido|reserva|encargar/i.test(String(el.className || '') + ' ' + txt)) s += 2;
      const r = el.getBoundingClientRect();
      if (r.height >= 30 && r.height <= 70) s += 1;
      if (gcs(el).backgroundColor !== 'rgba(0, 0, 0, 0)') s += 1;
      if (s > btnScore) { btnScore = s; btn = el; }
    }
    if (btn) {
      const s = gcs(btn);
      R.button = { text: (btn.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), family: cleanFont(s.fontFamily), size: s.fontSize, weight: s.fontWeight, bg: s.backgroundColor, color: s.color, radius: s.borderRadius };
    }

    const nav = qsa('header, nav, [class*="navbar"], [class*="header"], [class*="nav-"]').filter(el => {
      const r = el.getBoundingClientRect();
      const cls = String(el.className || '');
      return r.height >= 30 && r.width >= 200 && r.top < 300 && r.left >= -5 && r.right <= innerWidth + 5
        && !/cookie|consent|top|announce|notice|cart|drawer|modal|dropdown|menu|submenu|panel/.test(cls);
    }).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    if (nav) { const s = gcs(nav); const r = nav.getBoundingClientRect(); R.nav = { height: Math.round(r.height), bg: s.backgroundColor, cls: String(nav.className).slice(0, 70) }; }

    const hero = qsa('[class*="hero"], [class*="banner"], [class*="slider"], [class*="carousel"], [class*="portada"]').filter(el => {
      const r = el.getBoundingClientRect();
      const cls = String(el.className || '');
      return r.height >= 80 && r.width >= 300 && !/top|announce|notice|cookie|consent/.test(cls);
    }).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    if (hero) { const s = gcs(hero); const r = hero.getBoundingClientRect(); const h1 = qs('h1,h2'); R.hero = { height: Math.round(r.height), bg: s.backgroundColor, radius: s.borderRadius, title: (h1 ? h1.textContent : '').trim().replace(/\\s+/g, ' ').slice(0, 70) }; }

    const cands = qsa('[class*="card"],[class*="producto"],[class*="articulo"],[class*="prod"],[class*="tarjeta"]');
    const scored = [];
    for (const el of cands) {
      if (el.closest('script,style,noscript')) continue;
      const cls = String(el.className || '');
      if (!cls) continue;
      const s = gcs(el);
      if (s.position === 'absolute' || s.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 100) continue;
      const hasImg = !!el.querySelector('img');
      if (/overlay|-?thumb|img|image|media|badge|icon|skeleton|wrap|grid|lista|row|col\\b|container|slider|swiper|track/.test(cls)) continue;
      const esProd = /(^|[\\s_:-])prod[\\s_:-]|producto|product\\b|articulo/.test(cls);
      const score = (esProd ? 4 : 0) + (hasImg ? 2 : 0) + (r.height >= 220 ? 1 : 0);
      if (score >= 3) scored.push({ el, score, cls });
    }
    scored.sort((a, b) => b.score - a.score);
    const cardEls = [];
    for (const c of scored) {
      if (cardEls.some(k => k.el.contains(c.el))) continue;
      cardEls.push(c);
      if (cardEls.length >= 6) break;
    }
    if (cardEls.length) {
      const m = cardEls.map(x => {
        const s = gcs(x.el); const r = x.el.getBoundingClientRect();
        const titulo = (x.el.querySelector('h3,h4,[class*="title"],[class*="name"],[class*="nombre"]')?.textContent
          || x.el.querySelector('img')?.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
        return { cls: x.cls.slice(0, 90), title: titulo, width: Math.round(r.width), height: Math.round(r.height), radius: s.borderRadius, bg: s.backgroundColor, borderColor: s.borderColor, shadow: s.boxShadow === 'none' ? '' : s.boxShadow.slice(0, 60), pad: s.padding };
      });
      R.cards = m;
      const avg = a => Math.round(m.reduce((t, x) => t + x[a], 0) / m.length);
      R.cardsAvg = { width: avg('width'), height: avg('height'), radius: m[0].radius, bg: m[0].bg, borderColor: m[0].borderColor, pad: m[0].pad, shadow: m[0].shadow };
      const g = cardEls[0].el.parentElement;
      if (g && gcs(g).gridTemplateColumns !== 'none') {
        R.gridColumns = gcs(g).gridTemplateColumns;
        R.gridGap = gcs(g).gap;
        R.gridCls = String(g.className).slice(0, 60);
      }
    }
    if (!R.gridColumns) {
      const grid = qs('[class*="grid"], [class*="products"], [class*="productos"], [class*="catalogo"]');
      if (grid) { R.gridColumns = gcs(grid).gridTemplateColumns; R.gridGap = gcs(grid).gap; R.gridCls = String(grid.className).slice(0, 60); }
    }

    const cont = qs('[class*=container], [class*=wrap], [class*=wrapper], main');
    if (cont) R.containerWidth = Math.round(cont.getBoundingClientRect().width);

    let priceColor = null;
    const pSelect = () => {
      const cands = qsa('[class*="price"], [class*="precio"]');
      const normal = cands.find(p => !/old|nuevo|antes|tachado|was|anterior/.test(String(p.className || '')));
      return (normal || cands[0]) ? gcs(normal || cands[0]).color : null;
    };
    if (cardEls.length) {
      const counts = new Map();
      let first = null;
      for (const x of cardEls) {
        for (const p of x.el.querySelectorAll('[class*="price"], [class*="precio"]')) {
          if (/old|tachado|antes|was|anterior/.test(String(p.className || ''))) continue;
          const c = gcs(p).color;
          if (!first) first = c;
          counts.set(c, (counts.get(c) || 0) + 1);
        }
      }
      let best = null, n = 0;
      for (const [c, cnt] of counts) if (cnt > n) { n = cnt; best = c; }
      priceColor = best || first;
    }
    R.priceColor = priceColor || pSelect();

    R.wa = !!qs('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    R.screen = innerWidth + 'x' + innerHeight;
    return JSON.stringify(R);
  } catch (e) {
    return JSON.stringify({ error: String((e && e.message) || e) });
  }
})()
`;

function cdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      }
    });
    ws.on('open', () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const myId = ++id;
          pending.set(myId, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: myId, method, params }));
        });
      },
      close() { try { ws.close(); } catch { } },
    }));
    ws.on('error', reject);
  });
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

const CDP_PROFILE = path.join(__dirname, '.tmp_cdp_profile');

function matarChrome(proc) {
  if (!proc || proc.pid === undefined) return;
  try { proc.kill(); } catch { }
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch { }
}

async function limpiarPerfil() {
  for (let i = 0; i < 4; i++) {
    try { fs.rmSync(CDP_PROFILE, { recursive: true, force: true }); return; } catch { await esperar(600); }
  }
}

async function abrirChromeCdp(url) {
  const chrome = chromePath();
  if (!chrome) return null;
  let proc = null;
  for (let intento = 0; intento < 3; intento++) {
    const port = 9200 + Math.floor(Math.random() * 90);
    try {
      await limpiarPerfil();
      fs.mkdirSync(CDP_PROFILE, { recursive: true });
      proc = spawn(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--window-size=1280,3000',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + CDP_PROFILE,
        'about:blank',
      ], { stdio: 'ignore' });
      let cdp = null;
      for (let i = 0; i < 30 && !cdp; i++) {
        await esperar(400);
        if (proc.exitCode !== null) break;
        try {
          const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => []);
          const target = list.find(t => t.type === 'page');
          if (target) cdp = await cdpClient(target.webSocketDebuggerUrl);
        } catch { }
      }
      if (!cdp) { matarChrome(proc); continue; }
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url });
      for (let i = 0; i < 40; i++) {
        await esperar(500);
        if (proc.exitCode !== null) break;
        try {
          const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
          if (r && r.result && r.result.value === 'complete') break;
        } catch { }
      }
      await esperar(1500); // CSS + app.js + datos
      return { cdp, proc, port };
    } catch { matarChrome(proc); }
  }
  return null;
}

async function extraerDiseno(cdp) {
  const res = await Promise.race([
    cdp.send('Runtime.evaluate', {
      expression: DISENO_SNIPPET,
      awaitPromise: true,
      returnByValue: true,
    }),
    esperar(30000).then(() => { throw new Error('timeout CDP'); }),
  ]);
  if (!res || res.exceptionDetails) {
    console.error('  [debug CDP] raw:', JSON.stringify(res && { hasResult: !!res.result, exc: res.exceptionDetails && res.exceptionDetails.text, excVal: res.exceptionDetails && res.exceptionDetails.exception && res.exceptionDetails.exception.description }).slice(0, 500));
    throw new Error('La página no devolvió datos de diseño.');
  }
  const parsed = JSON.parse(res.result.value);
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
}

function imprimirReporte(d) {
  console.log('');
  console.log('== DISENO DETECTADO ==');
  console.log(`  fuente body: ${d.fontBody || '-'}`);
  if (d.fontCatalog && d.fontCatalog.length) console.log(`  fuentes titulos: ${d.fontCatalog.join(', ')}`);
  else if (d.headings && d.headings.length) d.headings.forEach(h => h && console.log(`    ${h.tag}: ${h.family} ${h.size} ${h.weight}`));
  if (d.nav) console.log(`  navbar: ${d.nav.height}px · bg ${d.nav.bg}${d.nav.cls ? ' · <' + d.nav.cls + '>' : ''}`);
  if (d.hero) console.log(`  hero/banner: ${d.hero.height}px · bg ${d.hero.bg}${d.hero.title ? ' · "' + d.hero.title + '"' : ''}`);
  if (d.cardsAvg) {
    console.log(`  card: ${d.cardsAvg.width}x${d.cardsAvg.height} · radius ${d.cardsAvg.radius} · bg ${d.cardsAvg.bg} · pad ${d.cardsAvg.pad}${d.cardsAvg.shadow ? ' · sombra ' + d.cardsAvg.shadow : ''}`);
    if (d.cards) d.cards.slice(0, 3).forEach(c => console.log(`    - ${c.cls}${c.title ? ' · "' + c.title + '"' : ''}`));
  }
  if (d.gridColumns) console.log(`  grilla: ${d.gridColumns} (${d.gridCls || ''}) · gap ${d.gridGap || '-'}`);
  if (d.button) console.log(`  boton: "${d.button.text || ''}" ${d.button.family} ${d.button.size} peso ${d.button.weight} · bg ${d.button.bg} · color ${d.button.color} · radius ${d.button.radius}`);
  if (d.containerWidth) console.log(`  contenedor: ${d.containerWidth}px`);
  if (d.priceColor) console.log(`  precio: color ${d.priceColor}`);
  console.log(`  WhatsApp: ${d.wa ? 'si' : 'no'}`);
  console.log('');
}

// ---------- analizar-imagen / analizar-web ----------
function analizarImagen(filePath, nombre) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe el archivo: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const format = detectImageFormat(buf);
  if (format === 'webp') {
    console.log(`  formato WEBP -> convirtiendo a PNG con Chrome...`);
    return analizarPixeles(convertToPng(filePath), 'png', nombre, 'webp (convertido)', 248);
  }
  if (format === 'png' || format === 'jpg') {
    return analizarPixeles(filePath, format, nombre, format, 255);
  }
  throw new Error(`Formato no soportado (${format}). Usá PNG, JPG o WEBP.`);
}

function capturaFallback(url, shot) {
  const chrome = chromePath();
  if (!chrome) throw new Error('No se encontró Chrome para capturar la página.');
  if (fs.existsSync(shot)) fs.unlinkSync(shot);
  execSync(`"${chrome}" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,2400 --virtual-time-budget=8000 --screenshot="${shot}" "${url}"`, { stdio: 'pipe' });
}

async function analizarWeb(url, nombre) {
  if (!fs.existsSync(DISENOS_DIR)) fs.mkdirSync(DISENOS_DIR, { recursive: true });
  const base = (nombre || 'sitio').replace(/[^\w-]+/g, '_');
  const shot = path.join(DISENOS_DIR, base + '.web.png');
  let diseno = null;

  const abierto = await abrirChromeCdp(url);
  if (abierto) {
    console.log(`  Capturando ${url} ...`);
    try {
      diseno = await extraerDiseno(abierto.cdp);
      const cap = await abierto.cdp.send('Page.captureScreenshot', { format: 'png' });
      if (cap && cap.data) fs.writeFileSync(shot, Buffer.from(cap.data, 'base64'));
    } catch (e) {
      console.log(`  (CDP: ${e.message})`);
    } finally {
      try { matarChrome(abierto.proc); } catch { }
      try { abierto.cdp.close(); } catch { }
      await limpiarPerfil();
    }
  } else {
    console.log(`  Capturando ${url} ... (sin CDP, solo colores)`);
  }

  if (!fs.existsSync(shot) && !diseno) capturaFallback(url, shot);
  if (!fs.existsSync(shot)) throw new Error('No se pudo capturar la página.');

  const tema = analizarPixeles(shot, 'png', nombre, 'web (captura)', 252);

  if (diseno) {
    const disenoJson = path.join(DISENOS_DIR, base + '.diseno.json');
    writeText(disenoJson, JSON.stringify({ archivo: base, url, capturado: new Date().toISOString(), ...diseno }, null, 2) + NL);
    imprimirReporte(diseno);
    console.log(`  Diseño guardado en ${path.relative(ROOT, disenoJson)}`);
  } else {
    console.log('  (No se pudo extraer el diseño por CDP: el sitio pudo bloquear el navegador headless.)');
  }
  return diseno;
}

function analizarPixeles(filePath, format, nombre, origen, whiteThreshold) {
  const { data, w, h } = decodePixels(filePath, format);
  const { total, palette } = dominantPalette(data, w, h, whiteThreshold);
  if (total === 0) throw new Error('No se pudieron muestrear píxeles.');

  const bg = palette[0].avg;
  const dark = isDark(bg);

  // acento = cluster más saturado, tono medio y distinto del fondo
  let accent = null;
  let accent2 = null;
  for (const p of palette) {
    const [, s, l] = rgbToHsl(p.avg);
    if (s < 0.15 || l < 0.12 || l > 0.88 || p.n / total < 0.02) continue;
    const d = Math.sqrt((p.avg[0] - bg[0]) ** 2 + (p.avg[1] - bg[1]) ** 2 + (p.avg[2] - bg[2]) ** 2);
    if (d < 40) continue;
    const score = s * (1 - Math.abs(l - 0.5)) * (d / 442);
    if (!accent || score > accent.score) {
      if (accent) accent2 = accent;
      accent = { c: p.avg, score };
    } else if (!accent2) {
      accent2 = { c: p.avg, score };
    }
  }

  const accentC = accent ? accent.c : (dark ? [176, 141, 83] : [163, 56, 39]);
  const accentDark = adjust(accentC, 0.78);
  const surface = dark ? blend(bg, [255, 255, 255], 0.08) : blend(bg, [255, 255, 255], 0.5);
  const ink = dark ? [247, 240, 230] : [42, 35, 28];
  const muted = dark ? blend(ink, bg, 0.45) : blend([96, 86, 74], bg, 0.45);
  const line = dark ? blend(bg, [255, 255, 255], 0.14) : blend(bg, [0, 0, 0], 0.14);
  const gold = accent2 ? accent2.c : (dark ? [196, 154, 108] : [176, 141, 83]);
  const navBg = dark ? adjust(bg, 0.82) : accentC;
  const navLine = dark ? blend(bg, accentC, 0.25) : blend(accentC, [0, 0, 0], 0.25);
  const accentHover = dark ? adjust(accentC, 0.85) : accentDark;

  const tema = {
    archivo: path.basename(filePath),
    oscuridad: dark ? 'oscuro' : 'claro',
    fondo: hex(bg),
    superficie: hex(surface),
    texto: hex(ink),
    muted: hex(muted),
    acento: hex(accentC),
    acentoHover: hex(accentHover),
    dorado: hex(gold),
    linea: hex(line),
    navFondo: hex(navBg),
    navLinea: hex(navLine),
    tokens: {
      '--bg': hex(bg),
      '--surface': hex(surface),
      '--surface-2': shiftL(surface, dark ? 0.02 : -0.05),
      '--line': hex(line),
      '--ink': hex(ink),
      '--muted': hex(muted),
      '--accent': hex(accentC),
      '--accent-hover': hex(accentHover),
      '--gold': hex(gold),
      '--nav-bg': hex(navBg),
      '--nav-line': hex(navLine),
    },
    paleta: palette.map(p => ({ hex: hex(p.avg), presencia: Math.round((p.n / total) * 100) })),
  };

  if (!fs.existsSync(DISENOS_DIR)) fs.mkdirSync(DISENOS_DIR, { recursive: true });
  const outName = nombre || path.basename(filePath, path.extname(filePath));
  const outPath = path.join(DISENOS_DIR, outName.replace(/\.[^.]+$/, '') + '.tema.json');
  writeText(outPath, JSON.stringify(tema, null, 2) + NL);

  console.log(`  ${w}x${h}px · ${total} muestras · ${origen} · tema ${tema.oscuridad}`);
  console.log('  paleta dominante:');
  for (const p of tema.paleta) console.log(`    ${p.hex}  ${p.presencia}%`);
  console.log(`  fondo: ${tema.fondo}   texto: ${tema.texto}   acento: ${tema.acento}`);
  console.log(`  Tema guardado en ${path.relative(ROOT, outPath)}`);
  return tema;
}

// ---------- aplicar-tema ----------
function aplicarTema(temaPath, webDir) {
  if (!fs.existsSync(temaPath)) throw new Error(`No existe el tema: ${temaPath}`);
  const tema = JSON.parse(readText(temaPath));
  if (!tema.tokens || !Object.keys(tema.tokens).length) throw new Error('El tema.json no contiene tokens.');
  const css = readText(path.join(webDir, 'style.css'));
  const block = ':root {' + NL + Object.entries(tema.tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join(NL) + NL + '}';
  if (!/^:root\s*\{/m.test(css)) throw new Error('style.css no tiene bloque :root.');
  const nuevo = css.replace(/^:root\s*\{[\s\S]*?\}/m, block);
  writeText(path.join(webDir, 'style.css'), nuevo);
  console.log(`  Tokens aplicados a ${path.relative(ROOT, path.join(webDir, 'style.css'))} (${Object.keys(tema.tokens).length} variables):`);
  Object.entries(tema.tokens).forEach(([k, v]) => console.log(`    ${k}: ${v}`));
}

// ---------- main ----------
async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const webDir = positional[1] ? path.resolve(ROOT, positional[1]) : DEFAULT_WEB;

  switch (cmd) {
    case 'modularizar':
      modularizar(webDir, flags.includes('force'));
      break;
    case 'extraer-contrato':
      extraerContrato(webDir);
      break;
    case 'validar':
      validar(webDir);
      break;
    case 'publicar':
      await publicar(webDir, flags);
      break;
    case 'analizar-imagen': {
      const img = positional[1];
      if (!img) throw new Error('Indicá la imagen: node herramientas/rediseno.mjs analizar-imagen <ruta> [--nombre cliente]');
      const nombre = flags.find(f => f.startsWith('nombre='))?.slice(7);
      analizarImagen(path.resolve(ROOT, img), nombre);
      break;
    }
    case 'analizar-web': {
      const url = positional[1];
      if (!url) throw new Error('Indicá la URL: node herramientas/rediseno.mjs analizar-web <url> [--nombre cliente]');
      const nombre = flags.find(f => f.startsWith('nombre='))?.slice(7);
      await analizarWeb(url, nombre);
      break;
    }
    case 'aplicar-tema': {
      if (!positional[1]) throw new Error('Indicá el tema: node herramientas/rediseno.mjs aplicar-tema <tema.json> [webDir]');
      const temaPath = path.resolve(ROOT, positional[1]);
      const targetWeb = positional[2] ? path.resolve(ROOT, positional[2]) : DEFAULT_WEB;
      aplicarTema(temaPath, targetWeb);
      break;
    }
    default:
      console.log('Uso: node herramientas/rediseno.mjs <comando> [argumentos] [opciones]');
      console.log('  modularizar [webDir] [--force]      separa index.html en style.css + app.js');
      console.log('  extraer-contrato [webDir]           genera herramientas/contrato.json');
      console.log('  validar [webDir]                    verifica el diseño contra el contrato');
      console.log('  publicar [--deploy] [--repo=...]    sync a Malcriado Vinos + build + (deploy)');
      console.log('  analizar-imagen <imagen> [--nombre=cliente]');
      console.log('                                      extrae paleta/tokens de un mockup a tema.json');
      console.log('  analizar-web <url> [--nombre=cliente]');
      console.log('                                      captura la URL con Chrome y extrae su paleta');
      console.log('  aplicar-tema <tema.json> [webDir]   aplica tokens :root a style.css');
      console.log('Opciones: --force, --deploy, --repo=user/repo, --nombre=cliente');
  }
}

await main();
