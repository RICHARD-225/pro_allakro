// Vérifie dans le navigateur : choix des responsables de campement, bouton « voir le mot de passe », droits du superviseur (blocs).
// Usage : node verif_roles.mjs [dossier de captures]   (serveurs de test lancés : lancer_serveurs_test.ps1 ; base : seed_allakro)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2] || 'captures_roles';
const SORTIE = isAbsolute(arg) ? arg : join(DOSSIER, arg);
mkdirSync(SORTIE, { recursive: true });
const BASE = 'http://localhost:5180';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let ko = 0;
const verifier = (condition, nom, detail = '') => { if (condition) { ok++; console.log('OK  ', nom, detail); } else { ko++; console.log('ÉCHEC', nom, detail); } };

const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.setViewport({ width: 1440, height: 900 });
const texte = () => page.evaluate(() => document.body.innerText);
const cliquer = (libelle) => page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(l))?.click(), libelle);

async function connexion(email, mdp) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', email);
  await page.type('input[autocomplete="current-password"]', mdp);
  await cliquer('Se connecter');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
}

// ---------------- Big Boss ----------------
await connexion('admin@allakro.com', 'Allakro@2025');
await page.goto(`${BASE}/campements`, { waitUntil: 'networkidle0' });
await cliquer('Nouveau campement');
await pause(600);
const options = await page.evaluate(async () => {
  const dialogue = document.querySelector('[role=dialog]');
  const libelle = [...dialogue.querySelectorAll('label')].find((l) => l.textContent.includes('Responsable'));
  const champ = libelle && document.getElementById(libelle.getAttribute('for'));
  if (!champ) return null;
  champ.click(); champ.focus();
  await new Promise((r) => setTimeout(r, 400));
  return [...document.querySelectorAll('[role=option]')].map((o) => o.textContent.trim());
});
console.log('Options du responsable :', JSON.stringify(options));
verifier(Array.isArray(options), 'Champ « Responsable » trouvé');
const personnes = (options || []).filter((o) => o && !/^(Choisir|Rechercher|Aucun)/.test(o));
verifier(personnes.length === 1 && /Jean|Kouassi/.test(personnes[0]), 'Seuls les utilisateurs superviseurs sont proposés', personnes.join(' | '));
verifier(/plusieurs campements/.test(await texte()), 'Mention « peut gérer plusieurs campements »');
await page.screenshot({ path: join(SORTIE, '1_campement_responsable.png') });
await cliquer('Annuler');
await pause(300);

// Bouton voir le mot de passe (création d'un utilisateur)
await page.goto(`${BASE}/utilisateurs`, { waitUntil: 'networkidle0' });
await cliquer('Nouvel utilisateur');
await pause(600);
const champ = await page.$('[role=dialog] input[type=password]');
verifier(!!champ, 'Champ mot de passe masqué par défaut');
if (champ) {
  await champ.type('Secret@2026abc');
  await cliquer('Afficher le mot de passe').catch(() => undefined);
  await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Afficher le mot de passe"]')?.click());
  await pause(200);
  const apres = await page.evaluate(() => { const i = document.querySelector('[role=dialog] input[autocomplete="new-password"]'); return { type: i.type, valeur: i.value }; });
  verifier(apres.type === 'text' && apres.valeur === 'Secret@2026abc', 'Le mot de passe devient visible (valeur conservée)', apres.type);
  await page.screenshot({ path: join(SORTIE, '2_mot_de_passe_visible.png') });
  await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Masquer le mot de passe"]')?.click());
  await pause(200);
  verifier(await page.evaluate(() => document.querySelector('[role=dialog] input[autocomplete="new-password"]').type === 'password'), 'Le bouton le masque à nouveau');
}

// ---------------- Superviseur ----------------
await page.evaluate(() => fetch('/api/v1/auth/logout/', { method: 'POST' }).catch(() => undefined));
await connexion('k.jean@allakro.com', 'Superviseur@2025');
await page.goto(`${BASE}/blocs`, { waitUntil: 'networkidle0' });
const t = await texte();
verifier(!/Nouveau bloc/.test(t), 'Superviseur : pas de bouton « Nouveau bloc »');
const modifs = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Modifier/i.test(b.getAttribute('aria-label') || b.title || '')).length);
verifier(modifs === 0, 'Superviseur : pas de bouton Modifier sur les blocs', String(modifs));
await page.screenshot({ path: join(SORTIE, '3_blocs_superviseur.png') });
await page.goto(`${BASE}/campements`, { waitUntil: 'networkidle0' });
verifier(!/Nouveau campement/.test(await texte()), 'Superviseur : pas de bouton « Nouveau campement »');
await page.goto(`${BASE}/utilisateurs`, { waitUntil: 'networkidle0' });
verifier(!/Nouvel utilisateur/.test(await texte()), 'Superviseur : pas d’accès à la gestion des utilisateurs');

console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
await page.close();
await navigateur.disconnect();
