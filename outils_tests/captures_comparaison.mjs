// Captures de toutes les pages principales (bureau 1 440 px, mobile 390 px, thème clair puis sombre) pour comparer deux versions de l'interface
// (ex. avant / après une mise à jour de Tailwind) avec comparer_captures.py. Pages en lecture seule : aucune donnée n'est modifiée.
// Usage : node captures_comparaison.mjs <dossier de sortie> [url de base]
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2] || 'captures_comparaison';
const SORTIE = isAbsolute(arg) ? arg : join(DOSSIER, arg);
const BASE = process.argv[3] || 'http://localhost:5180';
if (existsSync(SORTIE)) rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ['dashboard', 'plantations', 'campements', 'blocs', 'personnes', 'travaux', 'types-travaux', 'salaires', 'salaires?onglet=paiements',
  'depenses', 'categories', 'stock', 'particuliers', 'bilan', 'rapports', 'utilisateurs', 'journal', 'parametres'];

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.bringToFront();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
await page.reload({ waitUntil: 'networkidle0' });
await page.screenshot({ path: join(SORTIE, 'bureau_clair_login.png') });
await page.type('input[type=email]', 'admin@allakro.com');
await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter')).click());
await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });

for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => { localStorage.setItem('allakro_theme', t); localStorage.setItem('theme', t); }, theme);
  for (const [mode, vue] of [['bureau', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    await page.setViewport(vue);
    for (const chemin of PAGES) {
      await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle0', timeout: 30000 });
      if (theme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      else await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await pause(900);
      await page.screenshot({ path: join(SORTIE, `${mode}_${theme}_${chemin.replace(/[?=]/g, '-')}.png`) });
    }
  }
}
console.log('captures :', SORTIE);
await page.close();
await navigateur.disconnect();
