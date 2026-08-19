# Plan de Negocio — Nexus Lite

> Sistema local de gestión (POS + inventario + caja) con tienda online propia incluida.
> Mercado: Argentina · Modelo: venta a múltiples comercios.

---

## 1. Resumen ejecutivo

**Nexus Lite** es un sistema local de gestión (POS + inventario + caja) con **tienda online propia incluida**, pensado para pymes de Argentina.

Vende dos cosas:
1. Un sistema barato, sin mensualidades de software y con los datos en la PC del comercio.
2. Una tienda online publicada (GitHub Pages) con pedidos por WhatsApp / efectivo.

El primer cliente piloto es **Malcriado Vinos**. El plan apunta a replicar ese piloto en 10–50 comercios en 12 meses.

---

## 2. Propuesta de valor

- **Pago único / barato** vs. SaaS con suscripción.
- **Datos en casa**: sin depender de un servidor ajeno; funciona sin internet para el día a día.
- **Tienda online incluida** (sin pagar Shopify/WooCommerce/hosting) + **WhatsApp** como canal de pedido que el comerciante ya usa.
- **Backups encriptados** automáticos (GitHub privado) → tranquilidad.
- **Soporte local en español**, instalación y puesta a punto hecha por vos.

---

## 3. Mercado y cliente objetivo (Argentina)

- **Segmento**: pymes físicas — vinotecas, almacenes, kioscos, despensas, tiendas de barrio, ferreterías.
- **Dolores**:
  - Precios de sistemas caros.
  - Comisiones altas de delivery apps.
  - Clientes que piden por WhatsApp y pedidos que se pierden.
  - Miedo a la nube / complejidad.
- **Comprador**: dueño/a del comercio (no técnico), que quiere "simple y que funcione". Paga mejor por solución llave en mano que por software.

---

## 4. Modelo de negocio y precios (sugerido — validar con números de 2026)

Tres planes para que "gratis" sea el imán:

| Plan | Precio sugerido | Incluye |
|---|---|---|
| **Básico** (trial) | 30 días gratis | POS + inventario + caja local |
| **Estándar** | 1 pago (~USD 150–250 o ARS equivalente) | + tienda online + pedidos WhatsApp + backups |
| **Pro** | 1 pago mayor (~USD 350–500) + **soporte/mantenimiento anual** (USD 50–100/año) | + nube (Supabase) + acceso móvil + MercadoPago + instalación y branding |

**Decisiones de negocio:**
- Licencia única por comercio (carpeta + DB + clave).
- Setup único cobrado (instalación + branding + dominio).
- Mensualidad/anualidad de soporte opcional para ingreso recurrente.
- Reventa de "hosting de backup" / mantenimiento.

---

## 5. Proceso de venta e implementación

- **Funnel**: landing (1 página) → demo en vivo con su propio comercio → prueba 30 días → alta.
- **Onboarding por cliente**:
  1. Instalar / copiar carpeta + Node.
  2. Cargar productos / stock.
  3. Branding + datos de empresa.
  4. Publicar tienda (deploy).
  5. Configurar WhatsApp + nube.
  6. Capacitación 1 h.
- **Entregable por cliente**: carpeta `Cliente X` con su `database.db`, `.env`, `web/` y `dist/`.

---

## 6. Gaps a cerrar antes de vender masivo (roadmap)

### Fase 1 (corta, meses 1–2)
- [ ] Supabase habilitado (puente de pedidos) → **imprescindible** para prometer "pedidos que llegan aunque la PC esté apagada".
- [ ] Instalador `.exe` / ZIP auto-contenido (hoy requiere Node a mano).
- [ ] Asistente "nuevo cliente" (provisioning + branding + deploy).
- [ ] Clave de licencia + trial 30 días + vencimiento.
- [ ] Manuales (instalación, uso, FAQ) y checklist de onboarding.

### Fase 2 (media, meses 3–5)
- [ ] Acceso al panel desde el celular (iOS/Android).
- [ ] **MercadoPago** (cobro online) — clave para Argentina.
- [ ] Dashboard / reportes (ventas, mejores productos, caja, márgenes).
- [ ] WhatsApp Business API (notificación de estado de pedido).
- [ ] Canal de actualizaciones automáticas a clientes.

### Fase 3 (escalar)
- [ ] Facturación AFIP (factura A/B, IVA, monotributo) — si apuntás a comercios formales.
- [ ] Multi-usuario / roles; registro de auditoría.
- [ ] Listado en marketplace + landing multiuso.

---

## 7. Legal, impuestos y seguridad (Argentina)

- **AFIP**: la facturación se agrega en la Fase 3; mientras tanto aclarar que es "control de ventas", no reemplazo fiscal.
- **Ley 25.326 (Datos Personales)**: registrar bases de clientes que el comercio te ceda y un aviso de privacidad en la tienda online.
- **Términos y contrato**: licencia de uso, garantía limitada, responsabilidad por pérdida de datos (recomendar backups), propiedad de los datos (del cliente).
- **Seguridad**: nunca exponer GitHub token ni Service Key; claves solo en el `.env` / config local; PIN de acceso; acceso móvil con HTTPS + PIN.
- **Tributación tuya**: si vendés servicios, considerá monotributo; facturar soporte/anualidades.

---

## 8. Finanzas (escenarios de referencia)

- **Costos fijos aproximados**:
  - Hosting nulo (local-first).
  - Supabase free.
  - Dominio por cliente (~USD 10–15/año, trasladable).
  - Tu tiempo: instalación 4–8 h por cliente; soporte 1–2 h/mes.

- **Ingresos** (modelo Estándar USD 200 + soporte USD 60/año):
  - **10 clientes** año 1: ~USD 2.000 + USD 600 recurrentes.
  - **25 clientes**: ~USD 5.000 + USD 1.500/año recurrente.
  - **50 clientes**: ~USD 10.000 + USD 3.000/año recurrente (+ upsells de setup/dominio/mantenimiento).

- **KPIs**: clientes activos, % churn de soporte, tiempo de onboarding, % pedidos recibidos en la app (vs. WhatsApp), tickets de soporte.

---

## 9. Riesgos y mitigaciones

- **Pedidos que no llegan a la app (sin Supabase)** → mitigar con Fase 1 ya.
- **PC del cliente apagada** → los pedidos igual quedan en la nube/WhatsApp; comunicar expectativas.
- **Dependencia de GitHub Pages/Supabase (gratuitos)** → plan B: túnel/dominio propio por cliente Pro.
- **Cliente no técnico** → instalador + soporte remoto (AnyDesk) + videos.
- **Competencia (SaaS, apps de delivery)** → diferenciar con precio único + local-first + WhatsApp.

---

## 10. Próximos 90 días (accionable)

1. (0–2 sem) Cerrar Supabase en el piloto Malcriado y verificar pedidos end-to-end.
2. (2–4 sem) Instalador + asistente de cliente + licencia.
3. (4–6 sem) Manuales + landing + demo grabada.
4. (6–8 sem) Probar venta con 2–3 comercios amigos (validar precios).
5. (8–12 sem) Ajustar según feedback; arrancar Fase 2 (móvil + MercadoPago).
