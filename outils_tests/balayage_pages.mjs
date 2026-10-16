// Ouvre toutes les pages principales avec un compte donné et signale toute réponse d'erreur de l'API (4xx/5xx) ou erreur JavaScript.
// Un superviseur ne doit déclencher AUCUN refus (403) en consultant les pages qui lui sont ouvertes.
// Usage : node balayage_pages.mjs   (serveurs de test lancés, base de démonstration chargée)
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ['dashboard', 'plantations', 'campements', 'blocs', 'personnes', 'travaux', 'types-travaux', 'salaires', 'salaires?onglet=paiements',
  'depenses', 'categories', 'stock', 'particuliers', 'bilan', 'rapports', 'utilisateurs', 'journal', 'parametres'];
const COMPTES = [
  { nom: 'Super admin', email: 'admin@allakro.com', mdp: 'Allakro@2025' },
  { nom: 'Superviseur', email: 'k.jean@allakro.com', mdp: 'Superviseur@2025' },
];

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
let problemes = 0;
for (const compte of COMPTES) {
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  let courant = 'connexion';
  const erreurs = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && courant !== 'connexion') erreurs.push(`${courant} : ${r.status()} ${r.url().replace(BASE, '')}`);
  });
  page.on('pageerror', (e) => erreurs.push(`${courant} : erreur JavaScript ${String(e).slice(0, 120)}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', compte.email);
  await page.type('input[autocomplete="current-password"]', compte.mdp);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter')).click());
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  for (const chemin of PAGES) {
    courant = chemin;
    await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await pause(500);
    const etat = await page.evaluate(() => ({ chemin: location.pathname, erreur: /Une erreur est survenue/.test(document.body.innerText) }));
    if (etat.erreur) erreurs.push(`${chemin} : la page affiche « Une erreur est survenue »`);
  }
  console.log(`${compte.nom} : ${erreurs.length ? erreurs.length + ' problème(s)' : 'aucun problème'}`);
  erreurs.forEach((e) => console.log('   -', e));
  problemes += erreurs.length;
  await page.close();
}
await navigateur.disconnect();
process.exit(problemes ? 1 : 0);
