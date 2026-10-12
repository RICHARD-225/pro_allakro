// Captures des écrans modifiés (11 octobre 2026) : listes, filtre de période, Nouveau paiement, reçu (aperçu, impression).
// Usage : node captures_modif.mjs <dossier de sortie>
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(DOSSIER, process.argv[2] || 'captures_modif');
if (existsSync(SORTIE)) rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.bringToFront();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) erreurs.push(`console: ${m.text()}`); });
const aller = async (chemin) => { await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle0', timeout: 30000 }); await pause(1200); };
const ecran = (nom, pleine = false) => page.screenshot({ path: join(SORTIE, `${nom}.png`), fullPage: pleine });
const cliquerTexte = (texte, { exact = false } = {}) => page.evaluate((t, exact) => {
  const portee = [...document.querySelectorAll('[role=dialog]')].pop() || document;
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  const b = [...portee.querySelectorAll('button')].find((x) => x.offsetParent && (exact ? norm(x.textContent) === t : norm(x.textContent).startsWith(t)));
  b?.click();
  return !!b;
}, texte, exact);
const choisirOption = async (placeholder, libelle) => {
  await page.evaluate((p) => {
    const champ = [...document.querySelectorAll('input[role=combobox]')].find((i) => i.offsetParent && i.placeholder === p);
    champ?.click();
    champ?.focus();
  }, placeholder);
  await pause(250);
  const ok = await page.evaluate((l) => {
    const o = [...document.querySelectorAll('[role=option]')].find((x) => x.textContent.trim().startsWith(l));
    if (!o) return false;
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return true;
  }, libelle);
  await pause(600);
  return ok;
};
const fermer = async () => { await page.keyboard.press('Escape'); await pause(300); };
const rapport = {};

await page.setViewport({ width: 1440, height: 900 });
await aller('login');
await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
if ((await page.evaluate(async () => (await fetch('/api/v1/auth/me/', { credentials: 'include' })).status)) !== 200) {
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await cliquerTexte('Se connecter');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
}

for (const [mode, vue] of [['bureau', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  await page.setViewport(vue);
  await pause(600);

  // Listes
  for (const chemin of ['depenses', 'salaires', 'travaux', 'dashboard']) {
    await aller(chemin);
    await ecran(`${mode}_${chemin}`);
  }

  // Dépenses : période personnalisée
  await aller('depenses');
  if (mode === 'mobile') { await page.evaluate(() => document.querySelector('button[aria-label^="Filtres"]')?.click()); await pause(300); }
  rapport[`${mode}_periode_perso`] = await choisirOption('Période', 'Période personnalisée');
  await page.evaluate(() => {
    const dates = [...document.querySelectorAll('input[type=date]')].filter((i) => i.offsetParent);
    const regler = (champ, valeur) => {
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      proto.set.call(champ, valeur);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (dates.length >= 2) { regler(dates[0], '2025-09-01'); regler(dates[1], '2025-09-30'); }
  });
  await pause(1500);
  await ecran(`${mode}_depenses_periode_perso`);
  rapport[`${mode}_depenses_apres_filtre`] = await page.evaluate(() => document.body.innerText.match(/Total dépenses[\s\S]{0,60}/)?.[0]?.replace(/\s+/g, ' '));

  // Salaires : Nouveau paiement
  await aller('salaires');
  await cliquerTexte('Nouveau paiement');
  await pause(900);
  await ecran(`${mode}_nouveau_paiement`);
  // Recherche
  await page.evaluate(() => {
    const champ = document.querySelector('[role=dialog] input[type=search]');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto.set.call(champ, 'Fatou');
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pause(500);
  await ecran(`${mode}_nouveau_paiement_recherche`);
  rapport[`${mode}_lignes_apres_recherche`] = await page.evaluate(() => document.querySelectorAll('[role=dialog] li[data-remuneration]').length);

  // Payer (partiel avec référence et observation)
  await cliquerTexte('Payer');
  await pause(900);
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /Plus d'options/.test(b.textContent))?.click());
  await pause(300);
  await page.evaluate((mode) => {
    const regler = (champ, valeur) => {
      const proto = Object.getOwnPropertyDescriptor(champ.constructor.prototype, 'value');
      proto.set.call(champ, valeur);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const d = [...document.querySelectorAll('[role=dialog]')].pop();
    const champs = [...d.querySelectorAll('input')];
    const montant = champs.find((i) => i.type === 'number');
    regler(montant, '12000');
    const ref = champs.find((i) => /transaction/i.test(i.placeholder));
    regler(ref, `OM-${mode.toUpperCase()}-7788`);
    const obs = champs.filter((i) => i.type === 'text' && !i.placeholder && !i.getAttribute('role')).pop();
    regler(obs, 'Acompte remis au chef sur le chantier');
  }, mode);
  await pause(300);
  await ecran(`${mode}_payer_formulaire`);
  await cliquerTexte('Payer');
  await pause(1500);
  await ecran(`${mode}_apres_paiement`);

  // Aperçu du reçu
  await cliquerTexte('Aperçu du reçu');
  await pause(900);
  await ecran(`${mode}_apercu_recu`);
  rapport[`${mode}_apercu_contient`] = await page.evaluate(() => {
    const t = document.querySelector('.recu')?.innerText || '';
    return { reference: /OM-.*-7788/.test(t), observation: /Acompte remis au chef/.test(t), reste: /Reste à payer/.test(t), allakro: /ALLAKRO/.test(t) };
  });

  // Impression : seul le reçu doit rester à l'impression
  await page.evaluate(() => { window.__impressions = 0; window.print = () => { window.__impressions += 1; }; });
  await cliquerTexte('Imprimer le reçu');
  await pause(500);
  rapport[`${mode}_impression`] = await page.evaluate(() => ({
    appels: window.__impressions,
    zone: !!document.getElementById('zone-impression'),
    recuDansZone: !!document.querySelector('#zone-impression .recu'),
  }));
  await page.emulateMediaType('print');
  await pause(300);
  rapport[`${mode}_visibles_a_l_impression`] = await page.evaluate(() => [...document.body.children]
    .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.tagName));
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  writeFileSync(join(SORTIE, `${mode}_recu_impression.pdf`), pdf);
  await page.emulateMediaType('screen');
  await pause(200);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await fermer(); await fermer(); await fermer();
}

console.log(JSON.stringify(rapport, null, 1));
console.log('captures :', SORTIE);
console.log('erreurs JS :', erreurs.length ? erreurs.join(' | ') : 'aucune');
await page.close();
await navigateur.disconnect();
