# Nexus Lite

Sistema de gestión liviano + tienda web. Incluye:

- **`web/`** — tienda online estática (HTML + CSS + JS vanilla). La de la tienda está lista para conectarse a Supabase por REST o a un backend local.
- **`src/`** — app de administración (React + Vite + Tailwind). Se compila a `dist/`.
- **`api-server.js`** — API Express: sirve `web/` y la SPA, gestiona datos en SQLite (`database.db`) y se sincroniza con Supabase (pedidos por realtime).
- **`server-lite.js`** — servidor liviano (estático + proxy a la API principal).
- **`cloudflare-worker.js`** — worker de Cloudflare para distribuir la tienda.
- **`herramientas/`** — utilidades de desarrollo:
  - `rediseno.mjs` — CLI para modularizar el front, extraer el contrato, validar y publicar.
  - `analizar-diseno.bat` — arrastrás una imagen o pegás una URL y captura paleta/tema.
  - `supabase-setup.mjs` — crea las tablas en Supabase y carga los datos locales (seed).
- **`dist/`** — build de la SPA (artefacto, en `.gitignore`).

## Setup local

```bash
npm install          # dependencias (incluye @supabase/supabase-js)
npm run build        # compila la SPA a dist/
npm run start        # API en el puerto configurado (STANDALONE=true PORT=4050)
```

Para desarrollo de la tienda, serví `web/` con cualquier servidor estático:

```bash
npx http-server web -p 4060 -c-1
```

## Supabase

La tienda puede leer el catálogo y registrar pedidos directamente desde Supabase por REST.

### Configuración

1. Copiá `.env.sample` a `.env` y completá:

   | Variable | Dónde se usa | Exposición |
   | --- | --- | --- |
   | `SUPABASE_URL` | server + front | pública |
   | `SUPABASE_SERVICE_ROLE_KEY` | solo server local | **privada, jamás se sube** |
   | `PORT` | server | — |

2. Creá las tablas y cargá los datos locales:

   ```bash
   node herramientas/supabase-setup.mjs
   ```

   Requiere las credenciales en `.env` y el `SUPABASE_ACCESS_TOKEN` (Account settings → Access tokens) para ejecutar SQL por Management API.

3. El front (`web/app.js`) usa la anon key (pública) para leer catálogo e insertar pedidos por `/rest/v1/*`. Si no hay credenciales o el backend no responde, cae al `data.json`/`/api/web-data`.

4. **Numeración de pedidos**: cada pedido nuevo (online o local) recibe un ID correlativo `PED-XXXXXX`, partiendo del "Número inicial de pedidos" configurado en **Panel Web → Maestros** (`webConfig.orderStartNumber`). La nube lo asigna con un trigger (`assign_order_number`) sobre `orders`; los pedidos existentes no se re-numeran. Un contador (`app_config.orderSequence`) mantiene el último número usado.

> **Seguridad**: la `anon` key es pública por diseño — puede leer catálogo/config, insertar pedidos y ver la tabla `orders` (política RLS `USING(true)` **para todos los roles** porque los INSERT requieren `return=representation` y Realtime evalúa la política del rol emisor contra el suscriptor `service_role`; UPDATE/DELETE están bloqueados para `anon`). El script `supabase-setup.mjs` además agrega `orders` a la publicación `supabase_realtime` para que el `api-server` local reciba los pedidos en vivo. Para producción conviene restringir esa lectura (p. ej. columna `client_token` con política `USING(client_token = current_setting('request.headers')::jsonb->>'x-client-token')`). La `service_role` da acceso total y debe vivir únicamente en `.env`.

## Rediseño del front

Ver `herramientas/rediseno.mjs`:

```bash
node herramientas/rediseno.mjs modularizar    # index.html -> index + css + js
node herramientas/rediseno.mjs validar        # valida contratos (IDs, handlers, clases)
node herramientas/rediseno.mjs publicar       # copia a dist/ y al espejo
node herramientas/rediseno.mjs analizar-imagen imagen.png --nombre=demo
node herramientas/rediseno.mjs analizar-web https://tienda.com --nombre=ref
node herramientas/rediseno.mjs aplicar-tema temas/demo.tema.json
```