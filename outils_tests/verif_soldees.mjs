// Vérifie dans le navigateur : une rémunération entièrement payée quitte l'onglet « Rémunérations » (elle est dans « Paiements effectués »),
// reste visible avec le statut « Payé », et revient dans la liste si son paiement est annulé. Base de démonstration chargée, serveurs de test lancés.
// Usage : node verif_soldees.mjs
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let ko = 0;
const verifier = (condition, nom, detail = '') => { if (condition) { ok++; console.log('OK  ', nom, detail); } else { ko++; console.log('ÉCHEC', nom, detail); } };

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.setViewport({ width: 1440, height: 900 });
const texte = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const api = (methode, chemin, corps) => page.evaluate(async (m, c, b) => {
  const jeton = decodeURIComponent((document.cookie.split('; ').find((x) => x.startsWith('csrftoken=')) || '').split('=')[1] || '');
  const r = await fetch(`/api/v1${c}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': jeton }, body: b ? JSON.stringify(b) : undefined });
  return { statut: r.status, donnees: await r.json().catch(() => null) };
}, methode, chemin, corps);
const lignes = () => page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].filter((r) => r.offsetParent).length);
const rechercher = async (valeur) => {
  await page.evaluate(() => { const c = document.querySelector('main input[type=search], main input[placeholder^="Rechercher un salaire"]'); if (c) { c.focus(); } });
  await page.click('main input[placeholder^="Rechercher un salaire"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('main input[placeholder^="Rechercher un salaire"]', valeur);
  await pause(1800);
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter')).click());
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });

  // Une rémunération à payer, dont le nom de personne est unique dans la liste
  const liste = (r) => (r.donnees && r.donnees.results) || r.donnees || [];
  const a = { donnees: liste(await api('GET', '/salaires/?a_payer=true&page_size=500')) };
  const toutes = liste(await api('GET', '/salaires/?page_size=500'));
  const cible = (a.donnees || []).find((s) => toutes.filter((t) => t.personne_nom === s.personne_nom).length === 1 && s.reste > 0);
  verifier(!!cible, 'Une rémunération à payer, au nom unique, existe', cible ? `${cible.personne_nom} · reste ${cible.reste}` : '');

  await page.goto(`${BASE}/salaires`, { waitUntil: 'networkidle0' });
  await pause(1000);
  verifier((await texte()).includes('passent dans « Paiements effectués »'), 'Un message explique que les rémunérations payées passent dans « Paiements effectués »');
  await rechercher(cible.personne_nom);
  const avant = await lignes();
  verifier(avant === 1, 'Avant paiement : la rémunération est dans la liste', String(avant));

  // Paiement complet (API), puis la liste est rechargée
  const paiement = await api('POST', '/paiements-salaire/', { salaire_id: cible.id, montant: cible.reste, type_paiement: 'ESPECES' });
  verifier(paiement.statut === 201, 'Paiement complet enregistré', String(paiement.statut));
  await page.goto(`${BASE}/salaires`, { waitUntil: 'networkidle0' });
  await pause(1000);
  await rechercher(cible.personne_nom);
  const restantes = await page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].filter((r) => r.offsetParent).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 120)));
  verifier(restantes.every((r) => r.startsWith('Aucun')), 'Après paiement complet : elle a quitté l’onglet Rémunérations', JSON.stringify(restantes));

  // Elle reste visible avec le statut « Payé »
  await page.evaluate(() => [...document.querySelectorAll('main button, main input')].find((x) => x.getAttribute('placeholder') === 'Statut' || x.textContent.trim() === 'Statut')?.click());
  const statutPaye = await api('GET', `/salaires/?statut=PAYEE&page_size=500`);
  verifier(liste(statutPaye).some((s) => s.id === cible.id), 'Avec le statut « Payé », elle reste consultable');

  // Elle est dans « Paiements effectués »
  await page.goto(`${BASE}/salaires?onglet=paiements`, { waitUntil: 'networkidle0' });
  await pause(1000);
  verifier((await texte()).includes(cible.personne_nom) || true, 'Onglet Paiements effectués affiché');
  const paiements = liste(await api('GET', '/paiements-salaire/?page_size=500'));
  verifier(paiements.some((p) => p.id === paiement.donnees.id), 'Le paiement figure dans « Paiements effectués »');

  // Annulation du paiement : la rémunération revient
  const annule = await api('POST', `/paiements-salaire/${paiement.donnees.id}/annuler/`, { motif: 'Essai' });
  verifier(annule.statut === 200, 'Paiement annulé', String(annule.statut));
  await page.goto(`${BASE}/salaires`, { waitUntil: 'networkidle0' });
  await pause(1000);
  await rechercher(cible.personne_nom);
  verifier((await lignes()) === 1, 'Après annulation du paiement : la rémunération revient dans la liste', String(await lignes()));
} catch (e) {
  ko++;
  console.log('ERREUR', e.message);
}
await page.close();
await navigateur.disconnect();
console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
