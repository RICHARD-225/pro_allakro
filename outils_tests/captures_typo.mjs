// Captures pour l'audit typographie / UX : pages (bureau + mobile) et principaux formulaires et fiches.
// Usage : node captures_typo.mjs <dossier de sortie>
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(DOSSIER, process.argv[2] || 'captures_typo_avant');
if (existsSync(SORTIE)) rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ['dashboard', 'plantations', 'campements', 'blocs', 'personnes', 'travaux', 'types-travaux', 'salaires',
  'depenses', 'categories', 'previsions', 'stock', 'particuliers', 'bilan', 'rapports', 'utilisateurs', 'journal', 'parametres'];

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.bringToFront();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
const aller = async (chemin) => { await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle0', timeout: 30000 }); await pause(1500); };
const ecran = (nom, pleine = false) => page.screenshot({ path: join(SORTIE, `${nom}.png`), fullPage: pleine });
const cliquerTexte = (texte) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.replace(/\s+/g, ' ').trim().startsWith(t));
  b?.click();
  return !!b;
}, texte);
const fermer = async () => { await page.keyboard.press('Escape'); await pause(300); };

await page.setViewport({ width: 1440, height: 900 });
await aller('login');
await page.evaluate(() => localStorage.setItem('allakro_startup_seen', 'true'));
await ecran('bureau_login');
if ((await page.evaluate(async () => (await fetch('/api/v1/auth/me/', { credentials: 'include' })).status)) !== 200) {
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await cliquerTexte('Se connecter');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
}

const vues = [
  ['bureau', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }],
];
for (const [mode, vue] of vues) {
  await page.setViewport(vue);
  await pause(700);
  for (const chemin of PAGES) {
    await aller(chemin);
    await ecran(`${mode}_${chemin}`);
  }
  // Formulaires et fiches
  const formulaires = [
    ['travaux', 'Nouveau travail', 'form_travail'],
    ['personnes', 'Nouvelle personne', 'form_personne'],
    ['depenses', 'Nouvelle dépense', 'form_depense'],
    ['particuliers', 'Nouvel achat', 'form_achat'],
    ['salaires', 'Nouveau paiement', 'form_nouveau_paiement'],
    ['salaires', 'Nouvelle rémunération', 'form_remuneration'],
    ['blocs', 'Nouveau bloc', 'form_bloc'],
  ];
  for (const [chemin, bouton, nom] of formulaires) {
    await aller(chemin);
    if (await cliquerTexte(bouton)) {
      await pause(700);
      await ecran(`${mode}_${nom}`);
      await fermer();
    }
  }
  // Fenêtre « Payer » et fiches (clic sur une ligne)
  await aller('salaires');
  if (await cliquerTexte('Payer')) { await pause(700); await ecran(`${mode}_form_payer`); await fermer(); }
  for (const [chemin, nom] of [['travaux', 'fiche_travail'], ['personnes', 'fiche_personne'], ['salaires', 'fiche_salaire']]) {
    await aller(chemin);
    await page.evaluate(() => {
      const ligne = document.querySelector('main table tbody tr') && window.innerWidth >= 768
        ? document.querySelector('main table tbody tr')
        : document.querySelector('main .md\\:hidden > div[class*="px-4"]');
      ligne?.click();
    });
    await pause(1200);
    await ecran(`${mode}_${nom}`);
    await fermer();
  }
  // Confirmation de suppression
  await aller('depenses');
  await page.evaluate(() => {
    const plus = [...document.querySelectorAll('main button[aria-label="Plus d\'actions"]')].find((b) => b.offsetParent);
    plus?.click();
  });
  await pause(400);
  await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((b) => b.textContent.includes('Supprimer'))?.click());
  await pause(500);
  await ecran(`${mode}_confirmation_suppression`);
  await fermer();
}
console.log('captures :', SORTIE);
console.log('erreurs JS :', erreurs.length ? erreurs.join(' | ') : 'aucune');
await page.close();
await navigateur.disconnect();
