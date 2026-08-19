import express from 'express';
import path from 'path';
import fs from 'fs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 4050;
const WEB_DIR = path.resolve(__dirname, 'web');
const DIST_DIR = path.resolve(__dirname, 'dist');

// Serve web store (tienda online)
app.use('/web', express.static(WEB_DIR, { maxAge: 0 }));
app.get('/web/*', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// Proxy API to main server (if running)
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3010',
  changeOrigin: true,
  timeout: 3000,
  proxyTimeout: 3000,
}));

// Serve Nexus Lite SPA (built files)
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`[Nexus Lite] Sirviendo SPA desde ${DIST_DIR}`);
} else {
  console.warn('[Nexus Lite] ADVERTENCIA: No se encontró dist/. Ejecute "npm run build" primero.');
  app.get('/', (req, res) => {
    res.send('<h1>Nexus Lite</h1><p>Ejecute <code>npm run build</code> primero o use <code>npm run dev</code> para desarrollo.</p>');
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  Nexus Lite - Panel de Gestión`);
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}`);
  console.log(`  Tienda Web: http://localhost:${PORT}/web/`);
  console.log(`  API proxy:  http://localhost:3010`);
  console.log(`=========================================`);
});
