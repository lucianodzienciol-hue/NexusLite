/**
 * Nexus Lite — Cloudflare Worker: Admin remoto seguro
 *
 * Rol:
 *   1. Exige identidad Cloudflare Access (JWT firmado por el equipo) en cada request.
 *   2. Sirve la SPA de administración (proxy de assets) inyectando la URL del Worker
 *      para que el panel sepa que está siendo servido de forma remota y segura.
 *   3. Proxya SOLO rutas `/rest/*` hacia Supabase usando la SERVICE ROLE KEY
 *      (nunca expuesta al navegador) de forma que el panel remoto pueda leer/
 *      actualizar pedidos y catálogo que RLS prohibe al key anónimo.
 *
 * Variables de entorno (Workers > Settings > Variables):
 *   CF_TEAM_DOMAIN   = "miempresa.cloudflareaccess.com"
 *   CF_AUD           = Audience / Application ID del Access Application (ver guía)
 *   SUPABASE_URL     = "https://abcd1234.supabase.co"
 *   SUPABASE_SERVICE_ROLE_KEY = service_role key (solo server-side)
 *   ORIGIN_URL       = origen de los assets de la SPA, ej. "https://user.github.io/tu-repo"
 *
 * Despliegue: wrangler deploy
 *   Ruta:  https://admin.tudominio.com/*   (humedecer tras Cloudflare Access)
 */

const AUD = CLOUDFLARE_ACCESS_AUD || CF_AUD || '';
const TEAM = CF_TEAM_DOMAIN || '';
const SUPABASE_URL = SUPABASE_URL || '';
const SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY || '';
const ORIGIN = ORIGIN_URL || '';

let jwksCache = { keys: null, fetchedAt: 0 };

async function getJwks() {
  const ttl = 1800 * 1000; // 30 min
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < ttl) return jwksCache.keys;
  const url = `https://${TEAM}/cdn-cgi/access/certs`;
  const ctx = { fetch };
  const res = await fetch(url, { cf: { cacheTtl: ttl } });
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const jwks = await res.json();
  jwksCache = { keys: jwks.keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

async function verifyAccessJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (header.alg !== 'RS256') return false;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return false;
    if (AUD && (!Array.isArray(payload.aud) ? true : !payload.aud.includes(AUD)) && payload.aud !== AUD) return false;

    const keys = await getJwks();
    const key = keys.find((k) => k.kid === header.kid);
    if (!key) return false;

    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const sig = base64UrlDecodeBytes(parts[2]);
    const imported = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: key.n, e: key.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, imported, sig, data);
  } catch {
    return false;
  }
}

function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return decodeURIComponent(
    Array.prototype.map.call(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  );
}

function base64UrlDecodeBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check público (sin datos)
    if (url.pathname === '/__health') return new Response('ok', { status: 200 });

    const jwt = request.headers.get('cf-access-jwt-assertion') || '';
    if (!jwt) return new Response('Forbidden', { status: 403 });
    const ok = await verifyAccessJwt(jwt);
    if (!ok) return new Response('Unauthorized', { status: 401 });

    // 1) Proxy Supabase (service role) — solo rutas /rest/*
    if (url.pathname.startsWith('/rest/')) {
      const apiPath = url.pathname.replace(/^\/rest/, '') || '/';
      const target = new URL(`https://${SUPABASE_URL.replace(/^https?:\/\//, '')}${apiPath}${url.search}`);
      const headers = new Headers(request.headers);
      headers.set('apikey', SERVICE_ROLE_KEY);
      headers.set('Authorization', `Bearer ${SERVICE_ROLE_KEY}`);
      headers.delete('host');
      headers.delete('cf-access-jwt-assertion');
      return fetch(target.toString(), { method: request.method, headers, body: request.body });
    }

    // 2) Proxy de la SPA desde ORIGIN_URL e inyección del flag remoto
    let assetPath = url.pathname;
    if (assetPath === '/' || assetPath === '') assetPath = '/index.html';
    const origin = new URL(ORIGIN);
    const target = new URL(url.origin === origin.origin ? origin.toString() : ORIGIN);
    target.pathname = assetPath;
    target.search = url.search;

    const res = await fetch(target.toString(), request);
    const contentType = res.headers.get('content-type') || '';
    if (assetPath.endsWith('index.html') && contentType.includes('text/html')) {
      const html = await res.text();
      const injected = html.replace(
        '</head>',
        `<script>window.__NEXUS_REMOTE_API__ = ${JSON.stringify(url.origin)};</script></head>`
      );
      return new Response(injected, {
        status: res.status,
        headers: {
          'content-type': contentType,
          'cache-control': 'no-store',
        },
      });
    }
    return res;
  },
};