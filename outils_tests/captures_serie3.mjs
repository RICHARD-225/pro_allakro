// Captures de la troisième série : utilisateurs (création, suivi), formulaire de dépense, stock (retirer du stock), reçu PAYÉ.
// Mesure aussi le débordement horizontal de chaque écran (bureau 1 440 px et mobile 390 px).
// Usage : node captures_serie3.mjs <dossier de sortie>
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2] || 'captures_serie3';
const SORTIE = isAbsolute(arg) ? arg : join(DOSSIER, arg);
if (existsSync(SORTIE)) rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.bringToFront();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
const aller = async (chemin) => { await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle0', timeout: 30000 }); await pause(1200); };
const debord = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const ecran = async (nom) => { await page.screenshot({ path: join(SORTIE, `${nom}.png`) }); console.log(nom, 'débordement', await debord(), 'px'); };
const cliquerTexte = (texte) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.replace(/\s+/g, ' ').trim().startsWith(t));
  b?.click();
  return !!b;
}, texte);
const fermer = async () => { await page.keyboard.press('Escape'); await pause(300); };

await page.setViewport({ width: 1440, height: 900 });
await aller('login');
await page.evaluate(() => localStorage.setItem('allakro_startup_seen', 'true'));
if ((await page.evaluate(async () => (await fetch('/api/v1/auth/me/', { credentials: 'include' })).status)) !== 200) {
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await cliquerTexte('Se connecter');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
}

for (const [mode, vue] of [['bureau', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  await page.setViewport(vue);
  await pause(600);
  await aller('utilisateurs');
  await ecran(`${mode}_utilisateurs`);
  await cliquerTexte('Nouvel utilisateur');
  await pause(500);
  await ecran(`${mode}_nouvel_utilisateur`);
  await fermer();
  await page.evaluate(() => document.querySelector('table tbody tr, [data-row]')?.click());
  await pause(1200);
  await ecran(`${mode}_suivi_utilisateur`);
  await fermer();
  await aller('depenses');
  await ecran(`${mode}_depenses`);
  await cliquerTexte('Nouvelle dépense');
  await pause(500);
  await ecran(`${mode}_form_depense`);
  await fermer();
  await aller('stock');
  await ecran(`${mode}_stock`);
  await aller('salaires?onglet=paiements');
  await ecran(`${mode}_paiements`);
  await aller('travaux');
  await ecran(`${mode}_travaux`);
}
console.log('erreurs JS :', erreurs.length, erreurs.slice(0, 3).join(' | '));
await page.close();
await navigateur.disconnect();
