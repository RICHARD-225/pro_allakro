// Vérifie dans le navigateur : barre de progression sur une requête lente, entrée animée des pages, bouton « en cours »,
// et message d'erreur affiché sous le bon champ (téléphone déjà attribué). Serveurs de test lancés, base de démonstration chargée.
// Usage : node verif_chargement.mjs [dossier de captures]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2] || 'captures_chargement';
const SORTIE = isAbsolute(arg) ? arg : join(DOSSIER, arg);
mkdirSync(SORTIE, { recursive: true });
const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let ko = 0;
const verifier = (c, nom, detail = '') => { if (c) { ok++; console.log('OK  ', nom, detail); } else { ko++; console.log('ÉCHEC', nom, detail); } };

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.setRequestInterception(true);
let retardMs = 0;
page.on('request', (req) => {
  if (retardMs && req.url().includes('/api/v1/depenses')) setTimeout(() => req.continue().catch(() => undefined), retardMs);
  else req.continue().catch(() => undefined);
});
const barre = () => page.evaluate(() => {
  const b = document.querySelector('.barre-chargement');
  return b ? { etat: b.getAttribute('data-etat'), hauteur: b.getBoundingClientRect().height, piste: getComputedStyle(b.firstElementChild).animationName } : null;
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  // Le profil du navigateur de test a pu enregistrer le cache hors ligne d'une version de production : on le purge
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter')).click());
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.barre-chargement'), { timeout: 15000 }).catch(() => undefined);
  await pause(600);
  verifier((await barre()) === null, 'Au repos (page chargée) : aucune barre de progression, elle ne reste pas bloquée');

  // Requête rapide : pas de clignotement
  // Requête lente (1,6 s) : la barre apparaît, défile, puis disparaît
  retardMs = 1600;
  await page.goto(`${BASE}/depenses`, { waitUntil: 'domcontentloaded' });
  await pause(1000);
  const pendant = await barre();
  verifier(pendant && pendant.etat === 'cours' && pendant.hauteur >= 2 && pendant.piste === 'barreDefile', 'Requête lente : la barre de progression apparaît et défile', JSON.stringify(pendant));
  await page.screenshot({ path: join(SORTIE, '1_barre_en_cours.png') });
  await page.waitForFunction(() => !document.querySelector('.barre-chargement'), { timeout: 15000 }).catch(() => undefined);
  verifier((await barre()) === null, 'Fin de l’opération : la barre s’efface');
  retardMs = 0;

  // Entrée animée d'une page
  await page.goto(`${BASE}/stock`, { waitUntil: 'networkidle0' });
  await pause(150);
  const entree = await page.evaluate(() => {
    const c = document.querySelector('.page-entree > *');
    return c ? { nom: getComputedStyle(c).animationName, duree: getComputedStyle(c).animationDuration } : null;
  });
  verifier(entree && entree.nom === 'pageEntree', 'Changement de page : animation d’entrée', JSON.stringify(entree));

  // Bouton dont l'action est en cours (création d'un compte : le hachage du mot de passe prend un instant)
  await page.goto(`${BASE}/exploitation`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=plantation]', { timeout: 15000 });
  await pause(500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Campement') && b.closest('[data-testid=plantation]')).click());
  await pause(700);
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes('Nouveau responsable')).click());
  await pause(600);
  // Une fenêtre doit recouvrir TOUT l'écran (en-tête et menu compris) : l'animation d'entrée de la page ne doit pas la rogner
  const couverture = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role=dialog]')].pop();
    let e = dlg;
    while (e && !(e.classList.contains('fixed') && e.classList.contains('inset-0'))) e = e.parentElement;
    const r = e?.getBoundingClientRect();
    return r ? { haut: r.top, gauche: r.left, largeur: Math.round(r.width), hauteur: Math.round(r.height), ecran: [innerWidth, innerHeight] } : null;
  });
  verifier(couverture && couverture.haut === 0 && couverture.gauche === 0 && couverture.largeur === couverture.ecran[0] && couverture.hauteur === couverture.ecran[1],
    'Fenêtre : le fond grisé recouvre tout l’écran (en-tête et menu compris)', JSON.stringify(couverture));
  const idDe = (l) => page.evaluate((lib) => {
    const dlg = [...document.querySelectorAll('[role=dialog]')].pop();
    return [...dlg.querySelectorAll('label')].find((x) => x.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim().startsWith(lib))?.getAttribute('for');
  }, l);
  const saisir = async (l, v) => { const id = await idDe(l); await page.click(`[id="${id}"]`, { clickCount: 3 }); await page.type(`[id="${id}"]`, v); };
  // Téléphone d'une personne déjà enregistrée dans la base de démonstration (Jean Kouassi)
  await saisir('Prénom', 'Zoe'); await saisir('Nom', 'Nouvelle'); await saisir('Téléphone', '07 01 23 45 67');
  await saisir('E-mail', 'zoe@allakro.com'); await saisir('Mot de passe', 'Zoe@Test2026');
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].pop().querySelector('footer button:last-child, div:last-child > button:last-child').click());
  await pause(150);
  const bouton = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.classList.contains('btn-chargement'));
    return b ? { occupe: b.getAttribute('aria-busy'), barre: getComputedStyle(b, '::after').animationName } : null;
  });
  verifier(bouton && bouton.occupe === 'true' && bouton.barre === 'barreDefile', 'Bouton en cours d’action : barre de progression sur le bouton', JSON.stringify(bouton));
  await page.screenshot({ path: join(SORTIE, '2_bouton_en_cours.png') });
  // la création d'un compte hache le mot de passe : on attend la fin réelle de l'opération
  await page.waitForFunction(() => ![...document.querySelectorAll('[role=dialog] .btn-chargement')].length, { timeout: 30000 }).catch(() => undefined);
  await pause(600);
  const erreurs = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role=dialog]')].pop();
    return [...dlg.querySelectorAll('p')].filter((p) => /déjà attribué/.test(p.textContent)).map((p) => {
      const champ = p.closest('div')?.querySelector('label')?.textContent.replace(/[*\s]+/g, ' ').trim();
      return champ;
    });
  });
  verifier(erreurs.length === 1 && erreurs[0].startsWith('Téléphone'), 'Téléphone déjà attribué : le message est sous le champ Téléphone', JSON.stringify(erreurs));
  await page.screenshot({ path: join(SORTIE, '3_erreur_telephone.png') });
} catch (e) {
  ko++;
  console.log('ÉCHEC (exception)', e.message);
  await page.screenshot({ path: join(SORTIE, 'erreur.png') }).catch(() => undefined);
}
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
await page.close();
await navigateur.disconnect();
process.exit(ko ? 1 : 0);
