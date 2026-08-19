import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type IndexHtmlTransformResult} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_URL || './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'async-css',
        transformIndexHtml(html: string): IndexHtmlTransformResult {
          if (html.includes('rel="stylesheet"')) {
            const href = html.match(/href="([^"]+\.css)"/)?.[1] || '/assets/index.css';
            const asyncLink = html.replace(
              '<link rel="stylesheet"',
              '<link rel="preload" as="style" onload="this.onload=null;this.rel=\'stylesheet\'"'
            );
            return asyncLink.replace('</head>', `\n<noscript><link rel="stylesheet" href="${href}"></noscript>\n</head>`);
          }
          return html;
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
