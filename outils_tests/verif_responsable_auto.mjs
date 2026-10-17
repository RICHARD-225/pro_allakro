// Vérifie dans le navigateur : (1) quand un seul responsable est possible (ex. le Super admin seul), il est choisi automatiquement
// pour un nouveau campement ; (2) avec plusieurs responsables, rien n'est présélectionné ; (3) plantation et campement acceptent
// une superficie vide et le formulaire du campement propose la localisation. Base de démonstration chargée, serveurs de test lancés.
// Usage : node verif_responsable_auto.mjs
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let ko = 0;
const verifier = (condition, nom, detail = '') => { if (condition) { ok++; console.log('OK  ', nom, detail); } else { ko++; console.log('ÉCHEC', nom, detail); } };

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.setViewport({ width: 1440, height: 900 });
const texte = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const cliquer = async (libelle, { dansDialogue = false } = {}) => {
  const fait = await page.evaluate((l, d) => {
    const dlg = [...document.querySelectorAll('[role=dialog]')];
    const portee = d && dlg.length ? dlg[dlg.length - 1] : document;
    const b = [...portee.querySelectorAll('button')].find((x) => x.textContent.replace(/\s+/g, ' ').includes(l) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, libelle, dansDialogue);
  if (!fait) throw new Error(`Bouton introuvable : ${libelle}`);
  await pause(500);
};
// Valeur affichée d'une liste déroulante (le champ texte contient le libellé choisi, vide si rien n'est choisi)
const valeurListe = (libelle) => page.evaluate((l) => {
  const dlg = [...document.querySelectorAll('[role=dialog]')];
  const portee = dlg.length ? dlg[dlg.length - 1] : document;
  const lab = [...portee.querySelectorAll('label')].find((x) => x.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim().startsWith(l));
  return lab ? (portee.querySelector(`[id="${lab.getAttribute('for')}"]`)?.value ?? null) : null;
}, libelle);

let modeSeul = false;
await page.setRequestInterception(true);
page.on('request', async (req) => {
  if (modeSeul && /\/campements\/responsables\//.test(req.url())) {
    // On simule une base où le Super admin est le seul utilisateur
    const reponse = await fetch(req.url(), { headers: { cookie: (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } }).catch(() => null);
    const liste = reponse && reponse.ok ? await reponse.json() : [];
    const seul = liste.filter((p) => /Admin/.test(`${p.prenom} ${p.nom}`)).slice(0, 1);
    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(seul) });
  }
  return req.continue();
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', 'admin@allakro.com');
  await page.type('input[autocomplete="current-password"]', 'Allakro@2025');
  await cliquer('Se connecter');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });

  // 1. Plusieurs responsables possibles : aucun présélectionné
  await page.goto(`${BASE}/exploitation`, { waitUntil: 'networkidle0' });
  await cliquer('Nouvelle plantation');
  await pause(300);
  const labelsPlantation = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] label')].map((l) => l.textContent.replace(/\*/g, '').trim()));
  verifier(!labelsPlantation.some((l) => l.includes('Superficie')), 'Plantation : plus de champ superficie (calculée à partir des blocs)');
  await page.keyboard.press('Escape');
  await pause(400);
  await page.evaluate(() => { [...document.querySelectorAll('[data-testid=plantation]')][0].querySelectorAll('button').forEach((b) => { if (b.textContent.includes('Campement')) b.click(); }); });
  await pause(900);
  const labelsCamp = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] label')].map((l) => l.textContent.replace(/\*/g, '').trim()));
  verifier(labelsCamp.includes('Localisation'), 'Campement : champ localisation présent');
  verifier(!labelsCamp.some((l) => l.includes('Superficie')), 'Campement : plus de champ superficie (calculée à partir des blocs)');
  const plusieurs = await valeurListe('Responsable');
  verifier(plusieurs === '', 'Plusieurs responsables possibles : aucun choix automatique', JSON.stringify(plusieurs));
  await page.keyboard.press('Escape');
  await pause(500);

  // 2. Un seul responsable possible : choisi automatiquement
  modeSeul = true;
  await page.evaluate(() => { [...document.querySelectorAll('[data-testid=plantation]')][0].querySelectorAll('button').forEach((b) => { if (b.textContent.includes('Campement')) b.click(); }); });
  await pause(1500);
  const seul = await valeurListe('Responsable');
  verifier(/Admin/.test(seul || ''), 'Un seul responsable possible : choisi automatiquement', JSON.stringify(seul));
} catch (e) {
  ko++;
  console.log('ERREUR', e.message);
}
await page.close();
await navigateur.disconnect();
console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
