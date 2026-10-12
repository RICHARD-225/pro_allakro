import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Politique de sécurité du contenu (CSP) de la version de production : aucun script en ligne ni venu d'ailleurs, aucune
// connexion hors de l'application, aucun objet ou cadre. Les styles en ligne (attributs style de React et des graphiques) restent permis.
// L'en-tête HTTP équivalent (avec frame-ancestors) est posé par le serveur web : voir deploy/nginx.conf.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securiteProduction = () => ({
  name: 'allakro-securite',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="same-origin" />`);
  },
});

export default defineConfig({
  plugins: [react(), securiteProduction()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // L'API Django est servie sur la même origine que l'interface : cookies httpOnly sans souci de CORS
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
