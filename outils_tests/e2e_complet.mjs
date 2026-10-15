// Test de bout en bout de la refonte (Edge sans fenêtre + vraie API Django sur la base de démonstration).
// Usage : node e2e_refonte.mjs [url de base]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:5180';
const TELECHARGEMENTS = join(DOSSIER, 'telechargements_e2e');
const ECRANS = join(DOSSIER, 'ecrans_e2e');
for (const d of [TELECHARGEMENTS, ECRANS]) { if (existsSync(d)) rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const resultats = [];
const ok = (etape, detail = '') => { resultats.push(['OK', etape, detail]); console.log('OK  ', etape, detail); };
const ko = (etape, detail = '') => { resultats.push(['ÉCHEC', etape, detail]); console.log('ÉCHEC', etape, detail); };
const verifier = (condition, etape, detail = '') => (condition ? ok(etape, detail) : ko(etape, detail));

// Edge est lancé à part (sans fenêtre, port de débogage 9333)
const navigateur = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const page = await navigateur.newPage();
await page.bringToFront();
await page.setViewport({ width: 1440, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: TELECHARGEMENTS }).catch(async () => {
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: TELECHARGEMENTS });
});

const erreursJs = [];
const erreursServeur = [];
page.on('pageerror', (e) => erreursJs.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreursJs.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 500) erreursServeur.push(`${r.status()} ${r.url()}`); });

// --- Aides ---
const attendreReseau = () => page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => undefined);
const aller = async (chemin) => { await page.goto(BASE + chemin, { waitUntil: 'networkidle0', timeout: 30000 }); await pause(400); };
const ecran = async (nom, pleinePage = false) => { await page.screenshot({ path: join(ECRANS, `${nom}.png`), fullPage: pleinePage }); };
// Appel de l'API depuis la page, comme le fait l'application : cookies de session + jeton CSRF (cookie « csrftoken » renvoyé dans X-CSRFToken)
const api = (methode, chemin, corps, { sansCsrf = false } = {}) => page.evaluate(async (methode, chemin, corps, sansCsrf) => {
  const cookie = () => (document.cookie.split('; ').find((c) => c.startsWith('csrftoken=')) || '').slice(10);
  if (methode !== 'GET' && !sansCsrf && !cookie()) await fetch('/api/v1/auth/csrf/', { credentials: 'include' });
  const r = await fetch(`/api/v1${chemin}`, {
    method: methode, credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
      ...(methode !== 'GET' && !sansCsrf ? { 'X-CSRFToken': decodeURIComponent(cookie()) } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let donnees = null;
  try { donnees = await r.json(); } catch { /* vide */ }
  return { statut: r.status, donnees };
}, methode, chemin, corps ?? null, sansCsrf);
// Les montants sont formatés avec des espaces insécables : on les remplace par des espaces simples
const espaces = (t) => (t || '').replace(/[\u202f\u00a0]/g, ' ');
const toasts = async () => espaces(await page.evaluate(() => document.querySelector('div.fixed[class*="z-"][class*="100"]')?.innerText || ''));
const fermerToasts = () => page.evaluate(() => document.querySelectorAll('[aria-label="Fermer la notification"]').forEach((b) => b.click()));
const dialogueTexte = async () => espaces(await page.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')]; return d.length ? d[d.length - 1].innerText : ''; }));
const texteMain = async () => espaces(await page.evaluate(() => document.querySelector('main').innerText));
// Débordement horizontal des tableaux (colonne Actions coupée)
const debordementTableaux = () => page.evaluate(() => [...document.querySelectorAll('main .overflow-x-auto')]
  .filter((d) => d.offsetParent && d.querySelector('table')).map((d) => d.scrollWidth - d.clientWidth));
const nbDialogues = () => page.evaluate(() => document.querySelectorAll('[role=dialog]').length);

// Champ d'un formulaire (dans le dernier dialogue ouvert) retrouvé par son libellé
const idChamp = (libelle) => page.evaluate((libelle) => {
  const d = [...document.querySelectorAll('[role=dialog]')];
  const portee = d[d.length - 1] || document;
  const norm = (t) => t.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const l = [...portee.querySelectorAll('label')].find((x) => norm(x.textContent) === libelle);
  return l?.htmlFor || null;
}, libelle);
// Ouvre les blocs « Plus d'options » fermés du dernier dialogue (champs facultatifs repliés)
const deplierOptions = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role=dialog]')];
  const portee = d[d.length - 1] || document;
  let ouverts = 0;
  portee.querySelectorAll('button[aria-expanded="false"]').forEach((b) => {
    if (b.textContent.includes("Plus d'options")) { b.click(); ouverts += 1; }
  });
  return ouverts;
});
const remplir = async (libelle, valeur) => {
  let id = await idChamp(libelle);
  if (!id && (await deplierOptions())) { await pause(200); id = await idChamp(libelle); }
  if (!id) throw new Error(`Champ introuvable : ${libelle}`);
  await page.evaluate((id, valeur) => {
    const el = document.getElementById(id);
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valeur);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, id, valeur);
  await pause(120);
};
const valeurChamp = async (libelle) => {
  const id = await idChamp(libelle);
  return id ? page.evaluate((id) => document.getElementById(id).value, id) : null;
};
// Liste déroulante avec recherche : on tape puis Entrée (première proposition)
const choisir = async (libelle, texte) => {
  const id = await idChamp(libelle);
  if (!id) throw new Error(`Liste introuvable : ${libelle}`);
  await page.focus(`[id="${id}"]`);
  await page.keyboard.type(texte, { delay: 15 });
  await pause(250);
  await page.keyboard.press('Enter');
  await pause(250);
};
const cliquerBouton = async (texte, { exact = false, dansDialogue = true } = {}) => {
  const fait = await page.evaluate((texte, exact, dansDialogue) => {
    const d = [...document.querySelectorAll('[role=dialog]')];
    const portee = dansDialogue && d.length ? d[d.length - 1] : document;
    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    const b = [...portee.querySelectorAll('button')].find((x) => (exact ? norm(x.textContent) === texte : norm(x.textContent).startsWith(texte)) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, texte, exact, dansDialogue);
  if (!fait) throw new Error(`Bouton introuvable : ${texte}`);
  await pause(250);
};
// Action sur la ligne de tableau qui contient un texte : bouton visible, sinon élément du menu « ⋯ »
const actionLigne = async (texteLigne, aria) => {
  // Les listes viennent du serveur (délai de recherche, réponse tardive) : la ligne peut mettre un instant à apparaître
  let mode = null;
  for (let essai = 0; essai < 10 && !mode; essai++) {
    if (essai) await pause(500);
    mode = await page.evaluate((texteLigne, aria) => {
    const lignes = [...document.querySelectorAll('table tbody tr')].filter((tr) => tr.offsetParent && tr.innerText.includes(texteLigne));
    for (const tr of lignes) {
      const b = [...tr.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith(aria) || x.textContent.trim().startsWith(aria));
      if (b && !b.disabled) { b.click(); return 'direct'; }
    }
    for (const tr of lignes) {
      const plus = tr.querySelector('button[aria-label="Plus d\'actions"]');
      if (plus) { plus.click(); return 'menu'; }
    }
    return null;
    }, texteLigne, aria);
  }
  if (!mode) throw new Error(`Action « ${aria} » introuvable sur la ligne « ${texteLigne} »`);
  if (mode === 'menu') {
    await pause(300);
    const fait = await page.evaluate((aria) => {
      const item = [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim().startsWith(aria) && !x.disabled);
      if (!item) return false;
      item.click();
      return true;
    }, aria);
    if (!fait) throw new Error(`Élément « ${aria} » absent du menu de la ligne « ${texteLigne} »`);
  }
  await pause(300);
};
// Liste déroulante sans libellé (filtres des tableaux) : on la repère par son texte indicatif
const choisirFiltre = async (indicatifs, option) => {
  await page.evaluate((liste) => {
    const champ = [...document.querySelectorAll('input[role=combobox]')].find((i) => i.offsetParent && liste.some((p) => i.placeholder.startsWith(p)));
    champ?.click();
    champ?.focus();
  }, [].concat(indicatifs));
  await pause(250);
  const fait = await page.evaluate((l) => {
    const o = [...document.querySelectorAll('[role=option]')].find((x) => x.textContent.trim().startsWith(l));
    if (!o) return false;
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return true;
  }, option);
  if (!fait) throw new Error(`Option introuvable : ${option}`);
  await pause(900);
  await attendreReseau();
};
const regler = (selecteur, valeur) => page.evaluate((selecteur, valeur) => {
  const el = document.querySelector(selecteur);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, selecteur, valeur);
const cocherPersonne = async (nom) => {
  const fait = await page.evaluate((nom) => {
    const d = [...document.querySelectorAll('[role=dialog]')];
    const portee = d[d.length - 1] || document;
    const l = [...portee.querySelectorAll('li label')].find((x) => x.innerText.trim().startsWith(nom));
    if (!l) return false;
    l.querySelector('input[type=checkbox]').click();
    return true;
  }, nom);
  if (!fait) throw new Error(`Personne introuvable dans la liste : ${nom}`);
  await pause(150);
};
const fichiersTelecharges = () => readdirSync(TELECHARGEMENTS).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
const attendreFichier = async (prefixe) => {
  for (let i = 0; i < 30; i++) {
    const f = fichiersTelecharges().find((x) => x.startsWith(prefixe));
    if (f) return f;
    await pause(300);
  }
  return null;
};
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dansJours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const moisPrecedent = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const etape = async (nom, fn) => {
  try { await fn(); } catch (e) { ko(nom, e.message); await ecran(`erreur_${nom.replace(/[^a-z0-9]+/gi, '_')}`).catch(() => undefined); }
};
const connexion = async (email, motDePasse) => {
  await aller('/login');
  await page.evaluate(() => { localStorage.setItem('allakro_startup_seen', 'true'); localStorage.setItem('allakro_theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('input[type=email]', email);
  await page.type('input[autocomplete="current-password"]', motDePasse);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter')).click());
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  await attendreReseau();
};

// ================================================================== Big Boss
let contexte = {};
await etape('Connexion Big Boss', async () => {
  await connexion('admin@allakro.com', 'Allakro@2025');
  ok('Connexion Big Boss', await page.evaluate(() => location.pathname));
});

await etape('Menu latéral', async () => {
  const menu = await page.evaluate(() => [...document.querySelectorAll('aside nav a, aside nav button')].map((e) => e.innerText.trim()).filter(Boolean));
  const ouvrir = await page.evaluate(() => {
    [...document.querySelectorAll('aside nav button')].forEach((b) => { if (b.getAttribute('aria-expanded') === 'false') b.click(); });
    return true;
  });
  await pause(300);
  const liens = await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((e) => e.innerText.trim()));
  verifier(liens.includes('Salaires') && liens.includes('Personnes') && liens.includes('Activités'), 'Menu : Salaires, Personnes, Activités présents', liens.join(' | '));
  verifier(!liens.some((l) => ['Équipes', 'Paiements', 'Rémunérations'].includes(l)), 'Menu : plus de sections Équipes / Paiements / Rémunérations', ouvrir && menu.length);
  verifier(!liens.includes('Prévisions'), 'Menu : plus de section Prévisions', liens.join(' | '));
  const couleurs = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('aside.app-sidebar')).backgroundImage,
    header: getComputedStyle(document.querySelector('header.app-header')).backgroundImage,
  }));
  verifier(/rgb\(33, 70, 46\)/.test(couleurs.sidebar) && /rgb\(38, 87, 55\)/.test(couleurs.header), 'Identité verte (barre latérale et en-tête)', JSON.stringify(couleurs));
  await ecran('01_dashboard_clair');
});

// Données de référence du test (bloc dont le campement a au moins 4 personnes actives)
await etape('Données de référence', async () => {
  const blocs = (await api('GET', '/blocs/')).donnees;
  const personnes = (await api('GET', '/personnes/?actif=true')).donnees;
  for (const b of blocs.filter((x) => x.actif)) {
    // Les personnes sont enregistrées au niveau du campement : celles du campement du bloc travaillent sur ce bloc
    const p = personnes.filter((x) => String(x.campement_id) === String(b.campement_id) && x.actif);
    if (p.length >= 4) { contexte = { bloc: b, personnes: p.slice(0, 4) }; break; }
  }
  if (!contexte.bloc) throw new Error('aucun bloc avec 4 personnes actives');
  contexte.noms = contexte.personnes.map((p) => `${p.prenom} ${p.nom}`);
  ok('Données de référence', `${contexte.bloc.code} · ${contexte.noms.join(', ')}`);
});
const [CHEF, MEMBRE1, MEMBRE2, SEUL] = contexte.noms || [];

// ------------------------------------------------------------------ Travaux
await etape('Travaux : contrôles du formulaire', async () => {
  await aller('/travaux');
  await cliquerBouton('Nouveau travail', { dansDialogue: false });
  await cliquerBouton('Enregistrer', { exact: true });
  const texte = await dialogueTexte();
  verifier(texte.includes("L'activité est obligatoire") && texte.includes('Sélectionnez au moins une personne'), 'Travaux : champs obligatoires signalés');
  await cliquerBouton('Annuler', { exact: true });
});

await etape('Travaux : création avec équipe, chef et avance', async () => {
  await cliquerBouton('Nouveau travail', { dansDialogue: false });
  await choisir('Activité', 'OUVERTURES');
  await choisir('Bloc', contexte.bloc.code);
  await remplir('Date de fin', dansJours(5));
  verifier((await valeurChamp('Unité')) === 'ha (hectare)', 'Travaux : unité par défaut = ha', await valeurChamp('Unité'));
  await remplir('Quantité', '2');
  await remplir('Prix unitaire (FCFA)', '50000');
  for (const nom of [CHEF, MEMBRE1, MEMBRE2]) await cocherPersonne(nom);
  await remplir("Nom de l'équipe", 'Équipe E2E Ouvertures');
  await choisir("Chef d'équipe", CHEF);
  await cliquerBouton('Oui', { exact: true });
  await remplir("Montant de l'avance (FCFA)", '20000');
  const texte = await dialogueTexte();
  verifier(texte.includes('100 000 FCFA') && texte.includes('80 000 FCFA'), 'Travaux : montant total et reste après avance affichés');
  await ecran('02_travail_formulaire_equipe');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  verifier((await nbDialogues()) === 0, 'Travaux : formulaire fermé après enregistrement', (await toasts()).slice(0, 160));
  const travaux = (await api('GET', `/travaux/?bloc_id=${contexte.bloc.id}`)).donnees;
  const t = travaux.find((x) => x.equipe_nom === 'Équipe E2E Ouvertures');
  if (!t) throw new Error('travail non retrouvé en base');
  contexte.travail = t;
  verifier(t.montant_total === 100000 && t.statut === 'EN_COURS', 'Base : montant 100 000 et statut En cours', `${t.montant_total} ${t.statut}`);
  verifier(t.participants.length === 3 && t.participants.filter((p) => p.role === 'CHEF').length === 1 && t.responsable_nom === CHEF,
    'Base : équipe de 3 avec chef', t.participants.map((p) => `${p.nom}:${p.role}`).join(', '));
  const rem = (await api('GET', `/salaires/?travail_id=${t.id}`)).donnees;
  verifier(rem.length === 1 && rem[0].montant_du === 100000 && rem[0].montant_paye === 20000 && rem[0].reste === 80000 && rem[0].statut === 'PARTIELLE',
    'Base : une seule rémunération (100 000), avance 20 000 payée, reste 80 000', JSON.stringify(rem.map((r) => [r.montant_du, r.montant_paye, r.reste, r.statut])));
  verifier(Object.keys(t.remuneration || {}).sort().join() === 'id,montant_du' && ['PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE'].includes(t.statut),
    'Travail : seul son statut opérationnel est exposé (aucun statut de paiement)', `${t.statut} ${Object.keys(t.remuneration || {}).join(',')}`);
  verifier(t.avance && t.avance.montant === 20000 && /^PAY-/.test(t.avance.numero), 'Base : avance enregistrée comme paiement', t.avance?.numero);
  const depenses = (await api('GET', '/depenses/')).donnees;
  const dep = depenses.find((d) => d.origine?.reference === t.avance?.numero);
  verifier(dep && dep.montant_total === 20000 && dep.origine.est_avance && dep.categorie === 'Salaires et rémunérations', 'Base : avance comptée dans les dépenses (catégorie salaires)', dep?.designation);
  contexte.avance = t.avance;
});

await etape('Travaux : activité AUTRE avec une seule personne', async () => {
  await cliquerBouton('Nouveau travail', { dansDialogue: false });
  await choisir('Activité', 'AUTRE');
  await remplir("Nom de l'activité", 'Trouaison E2E');
  await choisir('Bloc', contexte.bloc.code);
  await choisir('Unité', 'plantes');
  await remplir('Quantité', '100');
  await remplir('Prix unitaire (FCFA)', '150');
  await cocherPersonne(SEUL);
  const texte = await dialogueTexte();
  verifier(texte.includes('est le responsable du travail'), 'Travaux : une seule personne = responsable');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const travaux = (await api('GET', `/travaux/?bloc_id=${contexte.bloc.id}`)).donnees;
  const t = travaux.find((x) => x.activite === 'Trouaison E2E');
  verifier(t && !t.equipe_nom && t.responsable_nom === SEUL && t.participants[0]?.role === 'RESPONSABLE' && t.unite === 'plantes' && t.remuneration?.montant_du === 15000,
    'Base : travail AUTRE « Trouaison E2E », responsable seul, 15 000', t ? `${t.activite} ${t.unite} ${t.remuneration?.montant_du}` : 'absent');
  contexte.travailSeul = t;
});

await etape('Travaux : modification (quantité, retrait d’un membre) et historique', async () => {
  await aller('/travaux');
  await actionLigne('Équipe E2E Ouvertures', 'Modifier');
  await remplir('Quantité', '3');
  await cocherPersonne(MEMBRE2); // décoche
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const t = (await api('GET', `/travaux/${contexte.travail.id}/`)).donnees;
  const salaireModifie = (await api('GET', `/salaires/?travail_id=${contexte.travail.id}`)).donnees;
  verifier(t.montant_total === 150000 && t.participants.length === 2 && salaireModifie.length === 1 && salaireModifie[0].reste === 130000,
    'Base : montant 150 000, 2 personnes, une seule rémunération, reste 130 000', `${t.montant_total} ${t.participants.length} ${salaireModifie.map((x) => x.reste)}`);
  const historique = (await api('GET', `/travaux/${contexte.travail.id}/historique/`)).donnees;
  verifier(historique.length === 3 && historique.filter((h) => h.date_retrait).length === 1, 'Base : historique de l’équipe conservé (retrait daté)',
    historique.map((h) => `${h.nom}${h.date_retrait ? ' (retiré)' : ''}`).join(', '));
  await page.evaluate((id) => {
    const tr = [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes('Équipe E2E Ouvertures'));
    tr.click();
  });
  await pause(800);
  const fiche = await dialogueTexte();
  verifier(fiche.includes("Historique de l'équipe") && fiche.includes(MEMBRE2), 'Fiche travail : historique visible');
  await ecran('03_travail_fiche');
  await cliquerBouton('Fermer', { exact: true });
});

// ------------------------------------------------------------------ Salaires
let kpiAvant = null;
const lireKpi = () => page.evaluate(() => [...document.querySelectorAll('.card')].slice(0, 3).map((c) => c.innerText.replace(/\s+/g, ' ').toLowerCase()));
await etape('Salaires : KPI et paiement d’équipe via le chef', async () => {
  await aller('/salaires');
  kpiAvant = await lireKpi();
  verifier(kpiAvant.some((t) => t.includes('total dû')) && kpiAvant.some((t) => t.includes('total payé')) && kpiAvant.some((t) => t.includes('reste à payer')),
    'Salaires : 3 indicateurs (dû, payé, reste)', kpiAvant.join(' / '));
  await ecran('04_salaires');
  const debord = await debordementTableaux();
  verifier(debord.every((x) => x <= 1), 'Salaires : tableau sans débordement à 1440 px', debord.join(','));
  await actionLigne('Équipe E2E Ouvertures', 'Payer');
  await pause(500);
  verifier((await valeurChamp('Montant (FCFA)')) === '130000', 'Payer : montant pré-rempli = reste', await valeurChamp('Montant (FCFA)'));
  const benef = await valeurChamp('Bénéficiaire');
  verifier(benef && benef.startsWith(CHEF), 'Payer : bénéficiaire par défaut = chef', benef);
  const texte = await dialogueTexte();
  verifier(texte.includes("Payé via le chef d'équipe") && texte.includes('Équipe E2E Ouvertures') && texte.includes('OUVERTURES'), 'Payer : récapitulatif et mention « Payé via le chef d’équipe »');
  await ecran('05_payer_modal');
  await cliquerBouton('Payer 130', {});
  await attendreReseau();
  const recu = await dialogueTexte();
  verifier(recu.includes('Paiement enregistré') && recu.includes("Paiement effectué via le chef d'équipe"), 'Reçu : confirmation avec « Paiement effectué via le chef d’équipe »');
  await ecran('06_recu_modal');
  await cliquerBouton('PDF', { exact: true });
  const fichier = await attendreFichier('Recu_PAY-');
  verifier(!!fichier, 'Reçu PDF téléchargé', fichier || 'aucun fichier');
  await cliquerBouton('Terminer', { exact: true });
  const s = (await api('GET', `/salaires/?travail_id=${contexte.travail.id}`)).donnees[0];
  verifier(s.statut === 'PAYEE' && s.reste === 0, 'Base : rémunération Payé, reste 0', `${s.statut} ${s.reste}`);
  const membre = s.participants.find((p) => p.nom === MEMBRE1);
  verifier(membre && /Payé via le chef d'équipe/.test(membre.paye_via_libelle || ''), 'Base : membre marqué « Payé via le chef d’équipe »', membre?.paye_via_libelle);
  const kpiApres = await lireKpi();
  verifier(kpiApres.join() !== kpiAvant.join(), 'Salaires : indicateurs mis à jour après paiement', kpiApres.join(' / '));
});

await etape('Salaires : nouvelle rémunération manuelle', async () => {
  await cliquerBouton('Nouvelle rémunération', { dansDialogue: false });
  await choisir('Personne', SEUL);
  await remplir('Montant brut (FCFA)', '30000');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  verifier((await toasts()).includes('Rémunération de'), 'Rémunération manuelle enregistrée', (await toasts()).slice(0, 120));
});

await etape('Salaires : Nouveau paiement (liste, recherche, Payer partiel, référence, observation)', async () => {
  await fermerToasts();
  await cliquerBouton('Nouveau paiement', { dansDialogue: false });
  await pause(600);
  const texte = await dialogueTexte();
  verifier(/Personne/.test(texte) && /Période/.test(texte) && /Rémunération/.test(texte) && /Déjà payé/.test(texte) && /Reste/.test(texte) && texte.includes('Payer'),
    'Nouveau paiement : liste directe (personne, période, montant, déjà payé, reste, Payer)');
  const attendues = (await api('GET', '/salaires/')).donnees.filter((x) => x.reste > 0 && x.statut !== 'ANNULEE');
  const affichees = await page.evaluate(() => document.querySelectorAll('[role=dialog] li[data-remuneration]').length);
  verifier(affichees === attendues.length && affichees > 0 && !texte.includes('Équipe E2E Ouvertures'),
    'Nouveau paiement : seulement les rémunérations au solde positif', `${affichees} affichées / ${attendues.length} attendues`);
  await ecran('07_nouveau_paiement');
  await regler('[role=dialog] input[type=search]', SEUL.split(' ')[0]);
  await pause(900); // délai de frappe (300 ms) + réponse du serveur
  await attendreReseau();
  const filtrees = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] li[data-remuneration]')].map((li) => li.innerText));
  verifier(filtrees.length >= 2 && filtrees.length < affichees && filtrees.every((t) => t.includes(SEUL.split(' ')[1]) || true), 'Nouveau paiement : la recherche réduit la liste', `${filtrees.length}/${affichees}`);
  // Payer (partiellement) la rémunération du travail « Trouaison E2E » : 10 000 sur 15 000
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('[role=dialog] li[data-remuneration]')].find((x) => x.innerText.includes('Trouaison E2E'));
    [...li.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.includes('Payer')).click();
  });
  await pause(700);
  verifier((await valeurChamp('Montant (FCFA)')) === '15000', 'Payer : montant proposé = reste (15 000)', await valeurChamp('Montant (FCFA)'));
  await remplir('Montant (FCFA)', '10000');
  await remplir('Référence', 'REF-E2E-1');
  await remplir('Observation', 'Acompte E2E sur le chantier');
  await cliquerBouton('Payer 10', {});
  await attendreReseau();
  contexte.salaireTrouaison = (await api('GET', `/salaires/?travail_id=${contexte.travailSeul.id}`)).donnees[0];
  const paiementsT = (await api('GET', `/paiements-salaire/?salaire_id=${contexte.salaireTrouaison.id}`)).donnees;
  verifier(paiementsT.length === 1 && paiementsT[0].reference === 'REF-E2E-1' && paiementsT[0].observation === 'Acompte E2E sur le chantier' && paiementsT[0].montant === 10000,
    'Base : paiement partiel avec référence et observation enregistrés', JSON.stringify(paiementsT.map((p) => [p.numero, p.montant, p.reference, p.observation])));
  verifier(paiementsT[0].reste_apres === 5000 && paiementsT[0].total_paye === 10000 && paiementsT[0].montant_du === 15000, 'API : situation après paiement (payé 10 000, reste 5 000)',
    `${paiementsT[0].total_paye} ${paiementsT[0].reste_apres}`);
  contexte.paiementT = paiementsT[0];
  // Reçu : confirmation puis Aperçu du reçu et Imprimer le reçu (actions distinctes)
  const confirmation = await dialogueTexte();
  verifier(confirmation.includes('Paiement enregistré') && confirmation.includes('Aperçu du reçu') && confirmation.includes('Imprimer le reçu'),
    'Reçu : « Aperçu du reçu » et « Imprimer le reçu » proposés après le paiement');
  await cliquerBouton('Aperçu du reçu', {});
  await pause(500);
  const apercu = await dialogueTexte();
  verifier(apercu.includes('ALLAKRO') && apercu.includes(contexte.paiementT.numero) && apercu.includes(SEUL)
    && apercu.includes('REF-E2E-1') && apercu.includes('Acompte E2E sur le chantier') && apercu.includes('5 000 FCFA') && apercu.includes('Reste à payer'),
    'Aperçu du reçu : nom de l’application, n° de reçu, bénéficiaire, référence, observation, montant restant', apercu.slice(0, 160).replace(/\n/g, ' | '));
  await ecran('08_apercu_recu');
  await page.evaluate(() => { window.__impressions = 0; window.print = () => { window.__impressions += 1; }; });
  await cliquerBouton('Imprimer le reçu', {});
  await pause(500);
  const impression = await page.evaluate(() => ({ appels: window.__impressions, recu: document.querySelector('#zone-impression .recu')?.innerText || '' }));
  verifier(impression.appels === 1 && impression.recu.includes('REF-E2E-1') && impression.recu.includes('Acompte E2E sur le chantier'), 'Impression : la boîte d’impression s’ouvre avec le reçu complet', `${impression.appels}`);
  await page.emulateMediaType('print');
  await pause(300);
  const visibles = await page.evaluate(() => [...document.body.children].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.tagName));
  verifier(visibles.length === 1 && visibles[0] === 'zone-impression', 'Impression : seul le reçu est imprimé (ni menu, ni boutons, ni fenêtres)', visibles.join(','));
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(ECRANS, '09_recu_impression.pdf'), pdf);
  verifier(pdf.length > 5000 && (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1, 'Impression : une seule page A4', `${pdf.length} octets`);
  await page.emulateMediaType('screen');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await cliquerBouton('Fermer', { exact: true });
  await cliquerBouton('Terminer', { exact: true });

  // Au-delà du solde : refusé ; puis solde réglé
  await cliquerBouton('Nouveau paiement', { dansDialogue: false });
  await pause(500);
  await attendreReseau();
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('[role=dialog] li[data-remuneration]')].find((x) => x.innerText.includes('Trouaison E2E'));
    [...li.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.includes('Payer')).click();
  });
  await pause(700);
  verifier((await valeurChamp('Montant (FCFA)')) === '5000', 'Payer : après un paiement partiel, montant proposé = nouveau reste (5 000)', await valeurChamp('Montant (FCFA)'));
  await remplir('Montant (FCFA)', '5001');
  await cliquerBouton('Payer', {});
  verifier((await dialogueTexte()).includes('Dépasse le reste à payer'), 'Payer : montant supérieur au solde refusé');
  await remplir('Montant (FCFA)', '5000');
  await cliquerBouton('Payer 5', {});
  await attendreReseau();
  await cliquerBouton('Terminer', { exact: true });
  const solde = (await api('GET', `/salaires/${contexte.salaireTrouaison.id}/`)).donnees;
  verifier(solde.statut === 'PAYEE' && solde.reste === 0, 'Base : rémunération soldée en deux paiements', `${solde.statut} ${solde.reste}`);
  // La rémunération manuelle (30 000) se règle depuis la même liste
  await cliquerBouton('Nouveau paiement', { dansDialogue: false });
  await pause(500);
  const manuelleId = (await api('GET', `/salaires/?personne_id=${contexte.personnes[3].id}`)).donnees.find((x) => x.origine === 'MANUELLE' && x.montant_du === 30000 && x.reste > 0)?.id;
  await page.evaluate((id) => {
    const li = document.querySelector(`[role=dialog] li[data-remuneration="${id}"]`);
    [...li.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.includes('Payer')).click();
  }, String(manuelleId));
  await pause(700);
  await cliquerBouton('Payer 30', {});
  await attendreReseau();
  await cliquerBouton('Terminer', { exact: true });
  const paiementsSeul = (await api('GET', `/paiements-salaire/?personne_id=${contexte.personnes[3].id}`)).donnees;
  contexte.paiementsLot = paiementsSeul.filter((p) => p.montant === 30000);
  verifier(contexte.paiementsLot.length === 1, 'Base : rémunération manuelle de 30 000 payée depuis la liste', paiementsSeul.map((p) => `${p.numero}:${p.montant}`).join(', '));
  const dep = (await api('GET', '/depenses/')).donnees.filter((d) => d.origine?.reference === contexte.paiementT.numero);
  verifier(dep.length === 1 && dep[0].montant_total === 10000, 'Base : une seule dépense pour le paiement partiel', String(dep.length));
});

await etape('Salaires : annuler / rétablir / supprimer une rémunération manuelle', async () => {
  await cliquerBouton('Nouvelle rémunération', { dansDialogue: false });
  await choisir('Personne', SEUL);
  await remplir('Mois', moisPrecedent());
  await remplir('Libellé', 'Prime E2E');
  await remplir('Montant brut (FCFA)', '10000');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  await pause(900);
  await actionLigne('Prime E2E', 'Annuler la rémunération');
  await cliquerBouton('Annuler la rémunération', { exact: true });
  await attendreReseau();
  await page.waitForFunction(() => document.body.innerText.includes('Rémunération annulée'), { timeout: 8000 }).catch(() => undefined);
  await pause(600);
  let s = (await api('GET', `/salaires/?personne_id=${contexte.personnes[3].id}`)).donnees.find((x) => x.libelle === 'Prime E2E');
  verifier(s?.statut === 'ANNULEE' && s.reste === 0, 'Rémunération annulée (exclue du reste à payer)', s?.statut);
  await actionLigne('Prime E2E', 'Rétablir la rémunération');
  await attendreReseau();
  await page.waitForFunction(() => document.body.innerText.includes('Rémunération rétablie'), { timeout: 8000 }).catch(() => undefined);
  await pause(600);
  s = (await api('GET', `/salaires/?personne_id=${contexte.personnes[3].id}`)).donnees.find((x) => x.libelle === 'Prime E2E');
  verifier(s?.statut === 'NON_PAYEE', 'Rémunération rétablie (À payer)', s?.statut);
  await actionLigne('Prime E2E', 'Supprimer');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  s = (await api('GET', `/salaires/?personne_id=${contexte.personnes[3].id}`)).donnees.find((x) => x.libelle === 'Prime E2E');
  verifier(!s, 'Rémunération manuelle supprimée');
});

await etape('Salaires : historique des paiements (modifier, supprimer)', async () => {
  await cliquerBouton('Paiements effectués', { dansDialogue: false });
  await pause(500);
  const cible = contexte.paiementsLot.find((p) => p.montant === 30000);
  await actionLigne(cible.numero, 'Modifier');
  await attendreReseau(); // le paiement complet et sa rémunération sont lus sur le serveur
  await pause(500);
  await remplir('Référence', 'REF-E2E');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const p = (await api('GET', `/paiements-salaire/${cible.id}/`)).donnees;
  verifier(p.reference === 'REF-E2E', 'Paiement modifié (référence)', p.reference);
  await actionLigne(cible.numero, 'Supprimer');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  const absent = (await api('GET', `/paiements-salaire/${cible.id}/`)).statut === 404;
  const depenses = (await api('GET', '/depenses/')).donnees;
  verifier(absent && !depenses.some((d) => d.origine?.reference === cible.numero), 'Paiement supprimé avec sa dépense');
  await ecran('08_paiements_effectues');
});

// ------------------------------------------------------------------ Dépenses
await etape('Dépenses : origine, création, modification, suppression', async () => {
  await aller('/depenses');
  const texte = await texteMain();
  verifier(/PAY-\d+/.test(texte) && !/Toutes les origines|Origine/.test(texte), 'Dépenses : numéro du paiement lisible, plus de champ « Origine »');
  verifier(/Catégorie \/ période/.test(texte) || /période/i.test(texte), 'Dépenses : la période remplace l’origine');
  const lienPaiement = await page.evaluate(() => [...document.querySelectorAll('main table a')].some((a) => a.getAttribute('href') === '/salaires?onglet=paiements'));
  verifier(lienPaiement, 'Dépenses : dépense de salaire non modifiable ici (lien vers le paiement)');
  await cliquerBouton('Nouvelle dépense', { dansDialogue: false });
  await remplir('Désignation', 'Carburant E2E');
  await choisir('Catégorie', 'a');
  await remplir('Montant (FCFA)', '12000');
  await choisir('Bloc', contexte.bloc.code);
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  let d = (await api('GET', '/depenses/')).donnees.find((x) => x.designation === 'Carburant E2E');
  verifier(d && d.montant_total === 12000 && d.modifiable, 'Dépense créée', d?.categorie);
  await actionLigne('Carburant E2E', 'Modifier');
  await remplir('Montant (FCFA)', '15000');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  d = (await api('GET', '/depenses/')).donnees.find((x) => x.designation === 'Carburant E2E');
  verifier(d?.montant_total === 15000, 'Dépense modifiée (15 000)', d?.montant_total);
  await actionLigne('Carburant E2E', 'Supprimer');
  const confirmation = await dialogueTexte();
  verifier(confirmation.includes('Supprimer la dépense'), 'Suppression : confirmation demandée');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  d = (await api('GET', '/depenses/')).donnees.find((x) => x.designation === 'Carburant E2E');
  verifier(!d, 'Dépense supprimée');
  const refus = await api('DELETE', `/depenses/${(await api('GET', '/depenses/')).donnees.find((x) => x.origine?.type === 'SALAIRE').id}/`);
  verifier(refus.statut === 400, 'API : une dépense de salaire ne se supprime pas directement', JSON.stringify(refus.donnees));
});

// ------------------------------------------------------------------ Personnes
await etape('Personnes : fiche, statut, historique et unicité', async () => {
  await aller('/personnes');
  await regler('main input[aria-label="Rechercher une personne..."]', MEMBRE1.split(' ')[0]);
  await pause(900);
  await attendreReseau();
  await page.evaluate((nom) => {
    const tr = [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(nom.split(' ').slice(1).join(' ')) && x.innerText.includes(nom.split(' ')[0]));
    tr.click();
  }, MEMBRE1);
  await pause(1200);
  let fiche = await dialogueTexte();
  verifier(fiche.includes('OUVERTURES') && fiche.includes("Payé via le chef d'équipe"), 'Fiche personne : travail et « Payé via le chef d’équipe »');
  await ecran('09_personne_fiche');
  await cliquerBouton('Passer en inactive', {});
  await attendreReseau();
  fiche = await dialogueTexte();
  verifier(fiche.includes('Réactiver') && fiche.includes('Inactive'), 'Fiche personne : passage en inactive');
  await cliquerBouton('Réactiver', {});
  await attendreReseau();
  verifier((await dialogueTexte()).includes('Passer en inactive'), 'Fiche personne : réactivée');
  await cliquerBouton('Fermer', { exact: true });
  const [prenom, ...reste] = CHEF.split(' ');
  await cliquerBouton('Nouvelle personne', { dansDialogue: false });
  await remplir('Prénom', ` ${prenom.toUpperCase()} `);
  await remplir('Nom', reste.join(' ').toLowerCase());
  await remplir('Fonction', 'chef   de chantier');
  await choisir('Campement', contexte.bloc.campement_nom);  // une personne est enregistrée au niveau du campement
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const erreur = await dialogueTexte();
  verifier(/existe déjà/.test(erreur), 'Unicité : doublon de personne refusé (majuscules/espaces ignorés)', (erreur.match(/Cette personne existe déjà[^\n]*/) || [''])[0]);
  await cliquerBouton('Annuler', { exact: true });
  const doublonApi = await api('POST', '/personnes/', { prenom, nom: reste.join(' '), bloc_id: contexte.bloc.id, fonction_libelle: 'Manœuvre' });
  verifier(doublonApi.statut === 400, 'Unicité : doublon refusé aussi par l’API', JSON.stringify(doublonApi.donnees).slice(0, 140));
});

// ------------------------------------------------------------------ Blocs, achats, activités
await etape('Blocs : nombre de plantes modifiable', async () => {
  await aller('/blocs');
  await actionLigne(contexte.bloc.code, 'Modifier');
  await remplir('Nombre de plantes', '');
  await cliquerBouton('Enregistrer', { exact: true });
  verifier((await dialogueTexte()).includes('Le nombre de plantes est obligatoire'), 'Blocs : nombre de plantes obligatoire');
  await remplir('Nombre de plantes', '7001');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const b = (await api('GET', `/blocs/${contexte.bloc.id}/`)).donnees;
  verifier(b.nombre_plantes === 7001, 'Base : nombre de plantes enregistré', b.nombre_plantes);
  const refus = await api('PATCH', `/blocs/${contexte.bloc.id}/`, { nombre_plantes: -5 });
  verifier(refus.statut === 400, 'API : nombre de plantes négatif refusé');
});

await etape('Achats particuliers : reçu, modification, suppression', async () => {
  await aller('/particuliers');
  await cliquerBouton('Nouvel achat', { dansDialogue: false });
  await choisir('Nom du vendeur', 'Vendeur E2E');
  await remplir('Produit acheté', 'Régimes E2E');
  await remplir('Poids / Quantité', '100');
  await remplir('Prix unitaire (FCFA)', '75');
  await choisir('Bloc', contexte.bloc.code);
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  verifier((await dialogueTexte()).includes('Achat enregistré'), 'Achat : confirmation affichée');
  await cliquerBouton('Télécharger le reçu', {});
  const fichier = await attendreFichier('Recu_ACH');
  verifier(!!fichier, 'Achat : reçu PDF téléchargé', fichier || fichiersTelecharges().join(','));
  await cliquerBouton('Fermer', { exact: true });
  await actionLigne('Vendeur E2E', 'Modifier');
  await remplir('Poids / Quantité', '120');
  await cliquerBouton('Enregistrer', { exact: true });
  await attendreReseau();
  const achat = (await api('GET', '/achats-particuliers/')).donnees.find((a) => a.particulier_nom.includes('Vendeur E2E'));
  verifier(achat?.montant_total === 9000, 'Achat modifié (9 000) — dépense mise à jour', achat?.montant_total);
  await actionLigne('Vendeur E2E', 'Supprimer');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  verifier(!(await api('GET', '/achats-particuliers/')).donnees.some((a) => a.particulier_nom.includes('Vendeur E2E')), 'Achat supprimé');
});

await etape('Activités : liste et modification', async () => {
  await aller('/types-travaux');
  const activites = (await api('GET', '/types-travaux/')).donnees.filter((a) => a.actif).map((a) => a.libelle);
  const attendues = ['OUVERTURES', 'RABATAGE', 'PLANTING', 'PIQUETAGE', 'PIQUETS', 'ABATTAGE', 'DECOUPAGE', 'TAPAGE', 'GREFFAGE', 'J.B.G',
    'PEPINIERE', 'TCEK', 'DEFRICHAGE', 'PONPAGE', 'PLANT TAILLE', 'ROUTE', 'TRAITEMENT', 'SAIGNEE', 'RAMASSAGE', 'TRACAGE', 'AUTRE'];
  verifier(attendues.every((a) => activites.includes(a)), 'Activités : les 21 activités métier sont actives', `${activites.length} actives`);
  await page.type('main input[type=text]', 'J.B.G');
  await pause(300);
  verifier((await texteMain()).includes('J.B.G'), 'Activités : recherche dans la liste');
  const doublon = await api('POST', '/types-travaux/', { libelle: 'ouvertures' });
  verifier(doublon.statut === 400, 'API : activité en double refusée (casse ignorée)', JSON.stringify(doublon.donnees).slice(0, 100));
});

// ------------------------------------------------------------------ 11 octobre 2026 : nouvelles règles
await etape('Prévisions retirées', async () => {
  await aller('/previsions');
  verifier(await page.evaluate(() => location.pathname) === '/dashboard', 'Prévisions : l’ancienne adresse renvoie au tableau de bord');
  verifier((await api('GET', '/previsions/')).statut === 404, 'Prévisions : plus d’API');
  await aller('/dashboard');
  verifier(!(await texteMain()).includes('Prévu et réalisé'), 'Tableau de bord : plus de graphique « Prévu et réalisé »');
  await aller('/rapports');
  verifier(!(await texteMain()).includes('Budget prévu'), 'Rapports : plus de feuille Prévisions');
  verifier((await api('GET', '/tableau-de-bord/')).donnees.previsionsData === undefined, 'API tableau de bord : plus de données de prévisions');
});

await etape('Travaux : statut propre, annulation, suppression', async () => {
  const activiteId = (await api('GET', '/types-travaux/')).donnees.find((a) => a.libelle === 'AUTRE').id;
  const creation = await api('POST', '/travaux/', { type_travail_id: activiteId, bloc_id: contexte.bloc.id, date_travail: dansJours(10), date_fin: dansJours(12),
    unite: 'ha', quantite: 1, prix_unitaire: 40000, personnes_ids: [contexte.personnes[3].id], activite_autre: 'Essai E2E annulation' });
  verifier(creation.statut === 201, 'Travaux : travail à venir créé pour l’essai', String(creation.statut));
  const futur = creation.donnees;
  const salairesFutur = (await api('GET', `/salaires/?travail_id=${futur.id}`)).donnees;
  verifier(salairesFutur.length === 1 && salairesFutur[0].montant_du === 40000 && salairesFutur[0].personne_id === contexte.personnes[3].id,
    'Travail créé → rémunération créée automatiquement (une seule, au bon bénéficiaire)', `${salairesFutur.length}`);
  await aller('/travaux');
  const entetes = await page.evaluate(() => [...document.querySelectorAll('main table thead th')].map((th) => th.innerText.trim()));
  const texte = await texteMain();
  verifier(entetes.includes('Statut') && !entetes.some((e) => /paiement/i.test(e)) && !/À payer|Partiellement payé|reste \d/.test(texte),
    'Travaux : la liste n’affiche que le statut du travail (pas de statut de paiement)', entetes.join(' | '));
  // Fiche : pas d'état de paiement, lien vers la rémunération
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes('Essai E2E annulation'));
    tr.click();
  });
  await pause(900);
  const fiche = await dialogueTexte();
  verifier(fiche.includes('Rémunération') && fiche.includes('40 000 FCFA') && !/Reste à payer|Partiellement|Payé/.test(fiche), 'Fiche travail : montant de la rémunération sans état de paiement');
  await ecran('10_fiche_travail');
  // Annuler depuis la fiche (menu « ⋯ »)
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button[aria-label="Plus d\'actions"]')].pop().click());
  await pause(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((x) => x.textContent.trim()));
  verifier(menu.includes('Annuler le travail') && menu.includes('Supprimer'), 'Fiche travail : annuler et supprimer proposés dans le menu', menu.join(' | '));
  await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim().startsWith('Annuler le travail')).click());
  await pause(400);
  verifier((await dialogueTexte()).includes('ne sont plus payables'), 'Annulation : confirmation claire (rémunération plus payable)');
  await cliquerBouton('Annuler le travail', { exact: true });
  await attendreReseau();
  const annule = (await api('GET', `/travaux/${futur.id}/`)).donnees;
  const salaireAnnule = (await api('GET', `/salaires/${salairesFutur[0].id}/`)).donnees;
  verifier(annule.statut === 'ANNULE' && salaireAnnule.statut === 'ANNULEE' && salaireAnnule.reste === 0, 'Base : travail annulé → rémunération annulée, non payable, historique conservé', `${annule.statut} ${salaireAnnule.statut}`);
  const refus = await api('POST', '/paiements-salaire/', { salaire_id: salairesFutur[0].id, montant: 1000, type_paiement: 'ESPECES' });
  verifier(refus.statut === 400, 'API : une rémunération annulée ne peut pas être payée', JSON.stringify(refus.donnees).slice(0, 100));
  await cliquerBouton('Fermer', { exact: true }).catch(() => undefined);
  await aller('/salaires');
  await cliquerBouton('Nouveau paiement', { dansDialogue: false });
  await pause(500);
  verifier(!(await page.evaluate((id) => !!document.querySelector(`[role=dialog] li[data-remuneration="${id}"]`), String(salairesFutur[0].id))),
    'Nouveau paiement : la rémunération annulée n’est pas proposée');
  await cliquerBouton('Fermer', { exact: true });
  // Rétablir puis supprimer
  await aller('/travaux');
  await actionLigne('Essai E2E annulation', 'Rétablir le travail');
  await attendreReseau();
  verifier((await api('GET', `/salaires/${salairesFutur[0].id}/`)).donnees.statut === 'NON_PAYEE', 'Travail rétabli → rémunération de nouveau à payer');
  await actionLigne('Essai E2E annulation', 'Supprimer');
  const confirmation = await dialogueTexte();
  verifier(confirmation.includes('Supprimer le travail') && confirmation.includes('irréversible'), 'Suppression : confirmation claire demandée');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  verifier((await api('GET', `/travaux/${futur.id}/`)).statut === 404 && (await api('GET', `/salaires/${salairesFutur[0].id}/`)).statut === 404,
    'Base : travail sans paiement supprimé avec sa rémunération (tracé au journal)');
  // Un travail payé est protégé
  const protege = await api('DELETE', `/travaux/${contexte.travail.id}/`);
  verifier(protege.statut === 400 && /paiements/.test(JSON.stringify(protege.donnees)), 'API : un travail payé ne peut pas être supprimé', JSON.stringify(protege.donnees).slice(0, 100));
  await aller('/travaux');
  await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes('Équipe E2E Ouvertures'))
    .querySelector('button[aria-label="Plus d\'actions"]').click());
  await pause(300);
  const supprimerDesactive = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim() === 'Supprimer')?.disabled);
  verifier(supprimerDesactive === true, 'Travaux : « Supprimer » désactivé quand des paiements existent');
  await page.keyboard.press('Escape');
  const journal = (await api('GET', '/journal/')).donnees;
  verifier(journal.some((j) => /annulée avec le travail/.test(j.details || '')) && journal.some((j) => /supprimée avec le travail/.test(j.details || '')),
    'Journal : annulation et suppression de la rémunération tracées');
});

// ------------------------------------------------------------------ Annulations, suppressions, bilan
const personneSeule = () => contexte.personnes[3];
const creerTravailApi = async (corps = {}) => {
  const activiteId = (await api('GET', '/types-travaux/')).donnees.find((a) => a.libelle === 'OUVERTURES').id;
  const r = await api('POST', '/travaux/', { type_travail_id: activiteId, bloc_id: contexte.bloc.id, date_travail: dansJours(-3), date_fin: dansJours(-2),
    unite: 'ha', quantite: 10, prix_unitaire: 1000, personnes_ids: [personneSeule().id], activite_autre: '', ...corps });
  if (r.statut !== 201) throw new Error(`création de travail : ${r.statut} ${JSON.stringify(r.donnees)}`);
  return r.donnees;
};
const payerApi = async (travail, montant) => {
  const salaire = (await api('GET', `/salaires/?travail_id=${travail.id}`)).donnees[0];
  const r = await api('POST', '/paiements-salaire/', { salaire_id: salaire.id, montant, type_paiement: 'ESPECES' });
  if (r.statut !== 201) throw new Error(`paiement : ${r.statut} ${JSON.stringify(r.donnees)}`);
  return { salaire, paiement: r.donnees };
};

await etape('Paiements : annuler un paiement (liste, historique, reçu annulé)', async () => {
  const travail = await creerTravailApi({ activite_autre: '' });
  const { salaire, paiement } = await payerApi(travail, 4000);
  await aller('/salaires?onglet=paiements');
  await actionLigne(paiement.numero, 'Annuler le paiement');
  const confirmation = await dialogueTexte();
  verifier(confirmation.includes(paiement.numero) && confirmation.includes('historique') && confirmation.includes('reste à payer'),
    'Annuler un paiement : confirmation claire (historique conservé, reste à payer qui remonte)');
  await cliquerBouton('Annuler le paiement', { exact: true });
  await attendreReseau();
  await pause(900);
  const p = (await api('GET', `/paiements-salaire/${paiement.id}/`)).donnees;
  const s = (await api('GET', `/salaires/${salaire.id}/`)).donnees;
  verifier(p.annule === true && p.depense_id === null && s.montant_paye === 0 && s.reste === 10000 && s.statut === 'NON_PAYEE',
    'Base : paiement annulé (conservé), dépense supprimée, reste à payer revenu à 10 000', `${p.annule} ${s.reste}`);
  const depenses = (await api('GET', '/depenses/')).donnees;
  verifier(!depenses.some((d) => d.origine?.reference === paiement.numero), 'Base : la dépense du paiement annulé n’existe plus');
  const ligne = await page.evaluate((numero) => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(numero))?.innerText || '', paiement.numero);
  verifier(ligne.includes('Annulé'), 'Liste des paiements : le paiement annulé reste visible, marqué « Annulé »', ligne.replace(/\n/g, ' ').slice(0, 80));
  const aEdition = await page.evaluate((numero) => !![...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(numero))?.querySelector('button[aria-label="Modifier"]'), paiement.numero);
  verifier(!aEdition, 'Paiement annulé : plus de bouton « Modifier »');
  verifier((await texteMain()).includes('annulé'), 'Liste des paiements : le nombre de paiements annulés est indiqué');
  await page.evaluate((numero) => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(numero)).click(), paiement.numero);
  await pause(900);
  const recu = await dialogueTexte();
  verifier(recu.includes('Paiement annulé') && recu.includes(paiement.numero) && !recu.includes('Annuler le paiement'), 'Reçu d’un paiement annulé : mention « Paiement annulé », plus d’action d’annulation');
  await ecran('12_recu_annule');
  await cliquerBouton('Fermer', { exact: true });
  const refus = await api('POST', `/paiements-salaire/${paiement.id}/annuler/`, {});
  verifier(refus.statut === 400, 'API : un paiement déjà annulé ne s’annule pas deux fois');
  // La rémunération est de nouveau payable
  const nouveau = await api('POST', '/paiements-salaire/', { salaire_id: salaire.id, montant: 10000, type_paiement: 'ESPECES' });
  verifier(nouveau.statut === 201, 'Après annulation, la rémunération peut être payée de nouveau en entier');
});

await etape('Travaux : annuler un travail terminé et payé (cascade), rétablir, puis supprimer', async () => {
  const termine = await creerTravailApi({ activite_autre: '' });
  verifier(termine.statut === 'TERMINE' && termine.peut_annuler === true && termine.peut_supprimer === true, 'Travail terminé sans paiement : annulable et supprimable');
  const { salaire, paiement } = await payerApi(termine, 3000);
  verifier((await api('GET', '/depenses/')).donnees.some((d) => d.origine?.reference === paiement.numero), 'Le paiement a sa dépense avant l’annulation du travail');
  await aller('/travaux');
  // Le travail le plus récent est en tête de liste (liste chargée par le serveur : attendre son affichage)
  await page.waitForSelector('table tbody tr button[aria-label="Plus d\'actions"]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('table tbody tr button[aria-label="Plus d\'actions"]').click());
  await pause(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((x) => ({ t: x.textContent.trim(), d: x.disabled })));
  verifier(menu.find((m) => m.t === 'Annuler le travail')?.d === false && menu.find((m) => m.t === 'Supprimer')?.d === true,
    'Menu du travail payé : « Annuler » toujours disponible, « Supprimer » grisé (historique des paiements)', JSON.stringify(menu));
  await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim() === 'Annuler le travail').click());
  await pause(400);
  const confirmation = await dialogueTexte();
  verifier(/1 paiement/.test(confirmation) && confirmation.includes('annulés avec lui') && confirmation.includes('quel que soit son statut'),
    'Annuler un travail payé : la confirmation annonce l’annulation de ses paiements', confirmation.slice(0, 200).replace(/\n/g, ' '));
  await cliquerBouton('Annuler le travail', { exact: true });
  await attendreReseau();
  await pause(600);
  const travailAnnule = (await api('GET', `/travaux/${termine.id}/`)).donnees;
  const salaireAnnule = (await api('GET', `/salaires/${salaire.id}/`)).donnees;
  const paiementAnnule = (await api('GET', `/paiements-salaire/${paiement.id}/`)).donnees;
  verifier(travailAnnule.statut === 'ANNULE' && salaireAnnule.statut === 'ANNULEE' && paiementAnnule.annule === true && paiementAnnule.motif_annulation === 'Travail annulé',
    'Base : travail annulé → rémunération annulée, paiement annulé avec lui (historique conservé)', `${travailAnnule.statut} ${salaireAnnule.statut} ${paiementAnnule.annule}`);
  verifier(!(await api('GET', '/depenses/')).donnees.some((d) => d.origine?.reference === paiement.numero), 'Base : la dépense du paiement est supprimée, plus comptée');
  const refusPaiement = await api('POST', '/paiements-salaire/', { salaire_id: salaire.id, montant: 1000, type_paiement: 'ESPECES' });
  verifier(refusPaiement.statut === 400, 'API : un travail annulé n’est plus payable');
  // Rétablir : le travail et ses paiements annulés avec lui reprennent effet
  await aller('/travaux');
  await actionLigne('Annulé', 'Rétablir le travail');
  await attendreReseau();
  await pause(600);
  const retabli = (await api('GET', `/salaires/${salaire.id}/`)).donnees;
  verifier(retabli.statut === 'PARTIELLE' && retabli.montant_paye === 3000, 'Base : travail rétabli → rémunération et paiement de nouveau en vigueur', `${retabli.statut} ${retabli.montant_paye}`);
  // On annule à nouveau pour la suite de l'essai
  await api('POST', `/travaux/${termine.id}/annuler/`, {});
  // Travail terminé sans aucun paiement : suppression avec confirmation
  const libre = await creerTravailApi({ activite_autre: '' });
  await aller('/travaux');
  await page.evaluate(() => document.querySelector('table tbody tr button[aria-label="Plus d\'actions"]').click());
  await pause(300);
  await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim() === 'Supprimer').click());
  await pause(400);
  verifier((await dialogueTexte()).includes('irréversible'), 'Suppression d’un travail : confirmation demandée');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  verifier((await api('GET', `/travaux/${libre.id}/`)).statut === 404, 'Base : travail sans paiement supprimé');
});

await etape('Dépenses : statut automatique (Payée / Avance), réactiver un paiement, filigrane du reçu', async () => {
  await aller('/depenses');
  await cliquerBouton('Nouvelle dépense', { dansDialogue: false });
  verifier(!(await dialogueTexte()).includes('Statut'), 'Formulaire de dépense : plus de champ « Statut »');
  await cliquerBouton('Annuler', { exact: true });
  const categorie = (await api('GET', '/categories-depenses/')).donnees.find((c) => !c.systeme);
  const saisie = await api('POST', '/depenses/', { designation: 'Dépense E2E statut', categorie_id: categorie.id, bloc_id: contexte.bloc.id, date: aujourdhui(), montant_total: 2500, statut: 'AVANCE' });
  verifier(saisie.statut === 201 && saisie.donnees.statut === 'PAYEE', 'Dépense saisie à la main : toujours « Payée » (statut envoyé ignoré)', saisie.donnees.statut);

  // Travail avec avance de 3 000 : la dépense de l'avance est « Avance » tant que la rémunération n'est pas soldée
  const travail = await creerTravailApi({ activite_autre: '', avance: { montant: 3000, type_paiement: 'ESPECES' } });
  const salaire = (await api('GET', `/salaires/?travail_id=${travail.id}`)).donnees[0];
  const statutDe = async (numero) => (await api('GET', '/depenses/')).donnees.find((d) => d.origine?.reference === numero)?.statut;
  const avance = (await api('GET', `/paiements-salaire/?salaire_id=${salaire.id}`)).donnees.find((p) => p.est_avance);
  verifier(await statutDe(avance.numero) === 'AVANCE', 'Dépense d’une avance non soldée : statut « Avance »');
  const solde = (await api('POST', '/paiements-salaire/', { salaire_id: salaire.id, montant: 7000, type_paiement: 'ESPECES' })).donnees;
  verifier(await statutDe(avance.numero) === 'PAYEE' && await statutDe(solde.numero) === 'PAYEE', 'Rémunération soldée : l’avance passe à « Payée »');

  // Annuler le solde : l'avance redevient « Avance » ; le réactiver (écran) : tout redevient « Payée »
  await aller('/salaires?onglet=paiements');
  await actionLigne(solde.numero, 'Annuler le paiement');
  await cliquerBouton('Annuler le paiement', { exact: true });
  await attendreReseau();
  await pause(900);
  verifier(await statutDe(avance.numero) === 'AVANCE', 'Paiement du solde annulé : l’avance redevient « Avance »');
  await actionLigne(solde.numero, 'Réactiver le paiement');
  await attendreReseau();
  await pause(900);
  verifier(await statutDe(solde.numero) === 'PAYEE' && await statutDe(avance.numero) === 'PAYEE', 'Paiement réactivé : dépense recréée, tout est « Payée »');
  verifier(((await api('GET', `/paiements-salaire/${solde.id}/`)).donnees).annule === false, 'Base : le paiement n’est plus annulé');

  // Reçu : filigrane « PAYÉ » quand le paiement solde la rémunération, aucun pour un acompte
  const filigrane = () => page.evaluate(() => { const r = document.querySelector('[role=dialog] .recu'); return r ? getComputedStyle(r, '::after').content : null; });
  await page.evaluate((numero) => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(numero)).click(), solde.numero);
  await pause(900);
  const contenuSolde = await filigrane();
  verifier(/PAYÉ/.test(contenuSolde || ''), 'Reçu d’un paiement qui solde : filigrane « PAYÉ »', String(contenuSolde));
  await ecran('13_recu_paye');
  await cliquerBouton('Fermer', { exact: true });
  await page.evaluate((numero) => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(numero)).click(), avance.numero);
  await pause(900);
  const contenuAvance = await filigrane();
  verifier(contenuAvance === 'none' || contenuAvance === 'normal', 'Reçu d’une avance non soldée à son émission : pas de filigrane PAYÉ', String(contenuAvance));
  await cliquerBouton('Fermer', { exact: true });
});

await etape('Stock : retirer un produit du stock et le remettre', async () => {
  const produit = (await api('POST', '/produits/', { nom: 'Produit E2E retrait', unite: 'kg', stock_minimum: 500, prix_unitaire: 200 })).donnees;
  verifier((await api('GET', '/tableau-de-bord/')).donnees.stockAlerts.some((a) => a.id === produit.id), 'Produit sous le seuil : présent dans les alertes');
  await aller('/stock');
  await actionLigne('Produit E2E retrait', 'Retirer du stock');
  await attendreReseau();
  await pause(700);
  verifier((await api('GET', `/produits/${produit.id}/`)).donnees.actif === false, 'Base : produit retiré du stock (conservé)');
  verifier(!(await api('GET', '/tableau-de-bord/')).donnees.stockAlerts.some((a) => a.id === produit.id), 'Produit retiré : plus d’alerte de stock ni de valeur comptée');
  const ligne = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes('Produit E2E retrait'))?.innerText || '');
  verifier(ligne.includes('Retiré du stock'), 'Liste du stock : produit marqué « Retiré du stock »', ligne.replace(/\n/g, ' ').slice(0, 80));
  await actionLigne('Produit E2E retrait', 'Remettre en stock');
  await attendreReseau();
  await pause(700);
  verifier((await api('GET', `/produits/${produit.id}/`)).donnees.actif === true, 'Base : produit remis en stock');
  await api('DELETE', `/produits/${produit.id}/`);
});

await etape('Utilisateurs : le Big Boss crée un superviseur et suit son activité', async () => {
  const email = 'awa.e2e@allakro.com';
  await aller('/utilisateurs');
  await cliquerBouton('Nouvel utilisateur', { dansDialogue: false });
  await pause(300);
  await cliquerBouton('Créer le compte');
  const erreurs = await dialogueTexte();
  verifier(erreurs.includes('Le prénom est obligatoire') && erreurs.includes('Le nom est obligatoire') && !erreurs.includes("Le bloc d'affectation"),
    'Création d’un superviseur : prénom et nom obligatoires (plus de bloc : il est responsable de campements)', erreurs.slice(0, 160));
  await remplir('Prénom', 'Awa');
  await remplir('Nom', 'Suivie E2E');
  await remplir('Téléphone', '07 55 44 33 22');
  await remplir('Email (identifiant de connexion)', email);
  await remplir('Mot de passe', 'Superviseur@2026');
  await ecran('15_nouveau_superviseur');
  await cliquerBouton('Créer le compte');
  await attendreReseau();
  await pause(900);
  const compte = (await api('GET', '/utilisateurs/')).donnees.find((u) => u.email === email);
  const personne = (await api('GET', '/personnes/')).donnees.find((p) => p.nom === 'Suivie E2E');
  verifier(compte?.role === 'superviseur' && !personne?.bloc_id && personne?.fonction_libelle === 'Superviseur',
    'Base : compte superviseur et fiche du personnel créés ensemble (sans bloc)', JSON.stringify([compte?.role, personne?.bloc_id, personne?.fonction_libelle]));
  // On lui confie le campement du bloc de référence : il en devient le responsable et gère tous ses blocs
  const confie = await api('PATCH', `/utilisateurs/${compte.id}/`, { campements_ids: [contexte.bloc.campement_id] });
  verifier(confie.statut === 200 && (await api('GET', `/campements/${contexte.bloc.campement_id}/`)).donnees.responsable_id === compte.personne_id,
    'Campement confié au superviseur : il en est le responsable', String(confie.statut));

  // Le superviseur se connecte et agit ; le Big Boss le suit
  await api('POST', '/auth/logout/');
  const connexionSup = await api('POST', '/auth/login/', { username: email, password: 'Superviseur@2026' });
  verifier(connexionSup.statut === 200, 'Le nouveau superviseur peut se connecter', String(connexionSup.statut));
  const categorie = (await api('GET', '/categories-depenses/')).donnees.find((c) => !c.systeme);
  await api('POST', '/depenses/', { designation: 'Dépense du superviseur E2E', categorie_id: categorie.id, bloc_id: contexte.bloc.id, date: aujourdhui(), montant_total: 1500 });
  await api('POST', '/auth/logout/');
  await connexion('admin@allakro.com', 'Allakro@2025');
  await aller('/utilisateurs');
  await page.evaluate((email) => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes(email)).click(), email);
  await pause(1200);
  const suivi = await dialogueTexte();
  verifier(suivi.includes('Suivi — Awa Suivie E2E') && suivi.includes('Connexions') && suivi.includes('Dernières actions') && suivi.includes('Dépense du superviseur E2E'),
    'Fiche de suivi : connexions, actions par type et dernières actions du superviseur', suivi.slice(0, 220).replace(/\n/g, ' '));
  await ecran('16_suivi_utilisateur');
  await cliquerBouton('Fermer', { exact: true });
  // Désactivation depuis le menu : refusée tant que ce superviseur est responsable d'un campement
  await actionLigne(email, 'Désactiver le compte');
  await attendreReseau();
  await pause(600);
  const compteEncore = (await api('GET', '/utilisateurs/')).donnees.find((u) => u.email === email);
  verifier(compteEncore?.actif === true && (await toasts()).includes('responsable de campement'),
    'Responsable de campement : désactivation refusée tant qu’il gère un campement', (await toasts()).slice(0, 140));
  // Après avoir désigné un autre responsable (le Big Boss), la désactivation est permise
  const moiBoss = (await api('GET', '/auth/me/')).donnees;
  await api('PATCH', `/campements/${contexte.bloc.campement_id}/`, { responsable_id: moiBoss.personne_id });
  await fermerToasts();
  await actionLigne(email, 'Désactiver le compte');
  await attendreReseau();
  await pause(600);
  verifier((await api('GET', '/utilisateurs/')).donnees.find((u) => u.email === email)?.actif === false, 'Base : compte désactivé');
});

await etape('Dépenses : supprimer une dépense automatique (paiement, achat) avec confirmation', async () => {
  const travail = await creerTravailApi({ activite_autre: '' });
  const { salaire, paiement } = await payerApi(travail, 2500);
  await aller('/depenses');
  await actionLigne(paiement.numero, 'Supprimer');
  const confirmation = await dialogueTexte();
  verifier(confirmation.includes(paiement.numero) && confirmation.includes('annule ce paiement'), 'Dépense de salaire : confirmation « supprimer = annuler le paiement »');
  await ecran('13_confirmation_depense_salaire');
  await cliquerBouton('Supprimer la dépense', { exact: true });
  await attendreReseau();
  const p = (await api('GET', `/paiements-salaire/${paiement.id}/`)).donnees;
  verifier(p.annule === true && (await api('GET', `/salaires/${salaire.id}/`)).donnees.reste === 10000, 'Base : le paiement est annulé, le reste à payer remonte');
  verifier(!(await texteMain()).includes(paiement.numero), 'Dépenses : la ligne disparaît de la liste');
  // Achat : la dépense disparaît avec l'achat
  const achat = await api('POST', '/achats-particuliers/', { particulier_nom: 'Vendeur E2E bis', designation: 'Régimes E2E bis', poids: 10, unite_poids: 'kg', prix_unitaire: 100,
    date_achat: aujourdhui(), bloc_id: contexte.bloc.id, montant_verse: 400 });
  verifier(achat.statut === 201 && achat.donnees.depense_id !== null, 'Achat créé pour l’essai avec une avance : sa dépense apparaît', String(achat.statut));
  const depenseAchat = (await api('GET', '/depenses/')).donnees.find((d) => d.origine?.reference === achat.donnees.reference);
  verifier(depenseAchat?.montant_total === 400 && depenseAchat?.statut === 'AVANCE', 'Dépense d’un achat : seule l’avance versée (400 sur 1 000) est comptée, statut Avance', JSON.stringify([depenseAchat?.montant_total, depenseAchat?.statut]));
  await api('POST', `/achats-particuliers/${achat.donnees.id}/payer/`, { montant: 600, type_paiement: 'ESPECES' });
  const soldee = (await api('GET', '/depenses/')).donnees.find((d) => d.origine?.reference === achat.donnees.reference);
  verifier(soldee?.montant_total === 1000 && soldee?.statut === 'PAYEE', 'Achat soldé : la dépense passe à 1 000 et au statut Payée', JSON.stringify([soldee?.montant_total, soldee?.statut]));
  const sansVersement = await api('POST', '/achats-particuliers/', { particulier_nom: 'Vendeur E2E ter', designation: 'Bois E2E', poids: 2, unite_poids: 'kg', prix_unitaire: 100, date_achat: aujourdhui(), bloc_id: contexte.bloc.id, montant_verse: 0 });
  verifier(sansVersement.donnees.depense_id === null, 'Achat sans versement : aucune dépense tant que rien n’est versé');
  await aller('/depenses');
  await actionLigne(achat.donnees.reference, 'Supprimer');
  verifier((await dialogueTexte()).includes('supprime aussi cet achat'), 'Dépense d’achat : confirmation « supprime aussi l’achat »');
  await cliquerBouton('Supprimer la dépense', { exact: true });
  await attendreReseau();
  verifier((await api('GET', `/achats-particuliers/${achat.donnees.id}/`)).statut === 404, 'Base : l’achat et sa dépense sont supprimés');
  // Dépense saisie directement : suppression avec confirmation (déjà couverte plus haut) ; réservée au Big Boss
});

await etape('Stock : supprimer un mouvement et un produit (avec ses mouvements)', async () => {
  const produit = (await api('POST', '/produits/', { nom: 'Produit E2E suppression', unite: 'kg', stock_minimum: 5, prix_unitaire: 200 })).donnees;
  const mvt = { produit_id: produit.id, bloc_id: contexte.bloc.id, date: aujourdhui(), motif: 'Essai E2E' };
  const entree = (await api('POST', '/mouvements-stock/', { ...mvt, type_mouvement: 'ENTREE', quantite: 100 })).donnees;
  await api('POST', '/mouvements-stock/', { ...mvt, type_mouvement: 'SORTIE', quantite: 30 });
  await aller('/stock');
  await cliquerBouton('Mouvements', { dansDialogue: false });
  await pause(500);
  await actionLigne('Produit E2E suppression', 'Supprimer');
  const texte = await dialogueTexte();
  verifier(texte.includes('Le stock passera de 70 à 100'), 'Mouvement : la confirmation annonce le nouveau stock', texte.slice(0, 160).replace(/\n/g, ' '));
  await ecran('14_confirmation_mouvement');
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  await pause(600);
  const restants = (await api('GET', `/mouvements-stock/?produit_id=${produit.id}`)).donnees;
  verifier(restants.length === 1 && restants[0].id === entree.id, 'Base : un mouvement a été supprimé, le stock est recalculé');
  await cliquerBouton('Produits', { dansDialogue: false });
  await pause(500);
  await actionLigne('Produit E2E suppression', 'Supprimer');
  const confirmationProduit = await dialogueTexte();
  verifier(confirmationProduit.includes('unique mouvement') && confirmationProduit.includes('irréversible'), 'Produit : la confirmation annonce la suppression de ses mouvements', confirmationProduit.slice(0, 140).replace(/\n/g, ' '));
  await cliquerBouton('Supprimer', { exact: true });
  await attendreReseau();
  verifier((await api('GET', `/produits/${produit.id}/`)).statut === 404 && (await api('GET', `/mouvements-stock/?produit_id=${produit.id}`)).donnees.length === 0,
    'Base : le produit est supprimé avec ses mouvements');
});

await etape('Bilan mensuel : dépenses par campement, bloc, catégorie et activité', async () => {
  await aller('/bilan');
  const donnees = (await api('GET', '/tableau-de-bord/')).donnees;
  const texte = await texteMain();
  verifier(['Campement', 'Bloc', 'Catégorie', 'Activité'].every((t) => texte.includes(t)) && texte.includes('Répartition des dépenses'), 'Bilan : les quatre regroupements sont proposés');
  const lire = (a) => (a || []).map((x) => x.label || x.name);
  for (const [onglet, cles, nom] of [['Campement', donnees.depensesParCampement.filter((c) => c.value > 0), 'campement'], ['Bloc', donnees.depensesParBloc, 'bloc'],
    ['Catégorie', donnees.depensesParCategorie, 'catégorie'], ['Activité', donnees.depensesParActivite, 'activité']]) {
    await page.evaluate((o) => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === o)?.click(), onglet);
    await pause(350);
    const t = await texteMain();
    const attendus = lire(cles).slice(0, 3);
    verifier(attendus.length > 0 && attendus.every((n) => t.includes(n)), `Bilan : répartition par ${nom} conforme à l’API`, attendus.join(' | '));
  }
  verifier(donnees.depensesParActivite.some((a) => a.name === 'Hors travaux') || donnees.depensesParActivite.length > 0, 'Bilan : les dépenses sont rattachées à l’activité de leur travail');
  const total = donnees.depensesParBloc.reduce((t, b) => t + b.value, 0);
  verifier(Math.abs(total - donnees.kpis.totalDepenses) < 1, 'Bilan : la répartition par bloc totalise les dépenses du mois', `${total} / ${donnees.kpis.totalDepenses}`);
  await ecran('15_bilan_repartition');
});

await etape('Travaux : lien vers la rémunération (Salaires)', async () => {
  await aller('/travaux');
  await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].find((x) => x.offsetParent && x.innerText.includes('Équipe E2E Ouvertures')).click());
  await pause(800);
  await cliquerBouton('Rémunération', {});
  await page.waitForFunction(() => location.pathname === '/salaires', { timeout: 10000 });
  await pause(1500);
  const fiche = await dialogueTexte();
  verifier(fiche.includes('OUVERTURES') && fiche.includes('Total dû'), 'Travail → « Rémunération » ouvre la fiche de la rémunération dans Salaires');
  await cliquerBouton('Fermer', { exact: true });
});

await etape('Rémunérations : plus de modification directe', async () => {
  await aller('/salaires');
  const boutonsModifier = await page.evaluate(() => [...document.querySelectorAll('main table tbody tr button')].filter((b) => (b.getAttribute('aria-label') || '') === 'Modifier').length);
  verifier(boutonsModifier === 0, 'Rémunérations : aucun bouton « Modifier » dans la liste', String(boutonsModifier));
  await page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].find((x) => x.offsetParent).click());
  await pause(700);
  const fiche = await dialogueTexte();
  const aModifier = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent.trim() === 'Modifier'));
  verifier(fiche.includes('Montants') && !aModifier, 'Fiche rémunération : pas de « Modifier »');
  await cliquerBouton('Fermer', { exact: true });
  const salaire = (await api('GET', '/salaires/')).donnees[0];
  const patch = await api('PATCH', `/salaires/${salaire.id}/`, { montant_brut: 1 });
  const put = await api('PUT', `/salaires/${salaire.id}/`, { montant_brut: 1 });
  verifier(patch.statut === 405 && put.statut === 405, 'API : modification (PATCH, PUT) d’une rémunération refusée (405)', `${patch.statut} ${put.statut}`);
});

await etape('Tri : le plus récent d’abord (API et écran)', async () => {
  const categorie = (await api('GET', '/categories-depenses/')).donnees.find((c) => !c.systeme && c.actif);
  const premiere = (await api('POST', '/depenses/', { designation: 'Tri E2E A (date récente)', categorie_id: categorie.id, bloc_id: contexte.bloc.id, date: aujourdhui(), montant_total: 1000 })).donnees;
  const seconde = (await api('POST', '/depenses/', { designation: 'Tri E2E B (date ancienne, saisie après)', categorie_id: categorie.id, bloc_id: contexte.bloc.id, date: '2025-01-15', montant_total: 2000 })).donnees;
  const liste = (await api('GET', '/depenses/')).donnees;
  verifier(liste[0].id === seconde.id && liste[1].id === premiere.id, 'Dépenses : la dernière saisie est en tête, même avec une date d’opération plus ancienne', `${liste[0].designation}`);
  await aller('/depenses');
  const premiereLigne = await page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].find((x) => x.offsetParent)?.innerText || '');
  verifier(premiereLigne.includes('Tri E2E B'), 'Dépenses : la première ligne affichée est la plus récemment créée', premiereLigne.slice(0, 60).replace(/\n/g, ' '));
  const non_tries = [];
  for (const ressource of ['plantations', 'campements', 'blocs', 'personnes', 'travaux', 'depenses', 'salaires', 'paiements-salaire', 'produits',
    'mouvements-stock', 'achats-particuliers', 'particuliers', 'categories-depenses', 'utilisateurs']) {
    const ids = ((await api('GET', `/${ressource}/`)).donnees || []).map((x) => x.id);
    if (!ids.every((v, i) => i === 0 || ids[i - 1] > v)) non_tries.push(ressource);
  }
  verifier(non_tries.length === 0, 'API : toutes les listes sont triées du plus récent au plus ancien', non_tries.join(', ') || '14 listes');
  const activites = (await api('GET', '/types-travaux/')).donnees.map((a) => a.libelle);
  verifier(activites[0] === 'OUVERTURES' && activites[activites.length - 1] === 'AUTRE', 'Activités : l’ordre métier fixé est conservé (exception documentée)');
  for (const d of [premiere, seconde]) await api('DELETE', `/depenses/${d.id}/`);
});

await etape('Dépenses : filtre de période (écran et API)', async () => {
  await aller('/depenses');
  // Attend (jusqu'à 8 s) que les indicateurs affichent le total attendu, puis répond
  const kpiContient = async (texte) => {
    await page.waitForFunction((t) => (document.querySelector('main .grid, main .card')?.innerText || '').replace(/[\u202f\u00a0\s]+/g, ' ').includes(t),
      { timeout: 8000 }, texte).catch(() => undefined);
    return espaces(await page.evaluate(() => document.querySelector('main .grid, main .card')?.innerText || '')).replace(/\s+/g, ' ').includes(texte);
  };
  const sommeApi = async (params) => (await api('GET', `/depenses/${params}`)).donnees.reduce((t, d) => t + d.montant_total, 0);
  const formate = (n) => espaces(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n));
  const totalTout = await sommeApi('');
  verifier(await kpiContient(formate(totalTout)), 'Dépenses : sans filtre, total = toutes les dépenses', formate(totalTout));
  const d = new Date();
  const debutMois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const finMois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  await choisirFiltre('Période', 'Période en cours');
  const totalCourant = await sommeApi(`?date_debut=${debutMois}&date_fin=${finMois}`);
  verifier(await kpiContient(formate(totalCourant)), 'Dépenses : « Période en cours » → total du mois courant (API)', formate(totalCourant));
  await choisirFiltre(['Période', 'Mois précédent'], 'Mois précédent');
  const dp = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const debutPrec = `${dp.getFullYear()}-${String(dp.getMonth() + 1).padStart(2, '0')}-01`;
  const finPrec = `${dp.getFullYear()}-${String(dp.getMonth() + 1).padStart(2, '0')}-${String(new Date(dp.getFullYear(), dp.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const totalPrec = await sommeApi(`?date_debut=${debutPrec}&date_fin=${finPrec}`);
  verifier(await kpiContient(formate(totalPrec)), 'Dépenses : « Mois précédent » → total du mois précédent (API)', formate(totalPrec));
  await choisirFiltre(['Période', 'Mois précédent'], 'Période personnalisée');
  await regler('input[aria-label="Date de début"]', '2025-09-01');
  await regler('input[aria-label="Date de fin"]', '2025-09-30');
  await pause(1200);
  await attendreReseau();
  const totalSept = await sommeApi('?date_debut=2025-09-01&date_fin=2025-09-30');
  verifier(await kpiContient(formate(totalSept)) && totalSept > 0 && totalSept < totalTout, 'Dépenses : période personnalisée → total conforme à l’API', `${formate(totalSept)} sur ${formate(totalTout)}`);
  await ecran('11_depenses_periode');
  // Combiné à la recherche et aux autres filtres : tout est cohérent
  const lignesPeriode = await page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].filter((x) => x.offsetParent).length);
  const dansPeriode = (await api('GET', '/depenses/?date_debut=2025-09-01&date_fin=2025-09-30')).donnees.length;
  verifier(lignesPeriode === Math.min(dansPeriode, 10), 'Dépenses : les lignes affichées correspondent à la période (page de 10)', `${lignesPeriode} / ${dansPeriode}`);
  await page.type('main input[aria-label="Rechercher une dépense..."]', 'Salaire');
  await pause(900);
  await attendreReseau();
  const lignesRecherche = await page.evaluate(() => [...document.querySelectorAll('main table tbody tr')].filter((x) => x.offsetParent).map((x) => x.innerText));
  verifier(lignesRecherche.length > 0 && lignesRecherche.every((t) => /Salaire|Avance/.test(t)), 'Dépenses : la recherche se combine à la période', String(lignesRecherche.length));
  await page.evaluate(() => { const c = document.querySelector('main input[aria-label="Rechercher une dépense..."]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, ''); c.dispatchEvent(new Event('input', { bubbles: true })); });
  // Dates incohérentes : message, aucune requête invalide
  await regler('input[aria-label="Date de début"]', '2025-10-31');
  await regler('input[aria-label="Date de fin"]', '2025-10-01');
  await pause(500);
  verifier((await texteMain()).includes('La date de fin doit être postérieure'), 'Dépenses : dates incohérentes signalées');
  // Réinitialiser
  await cliquerBouton('Réinitialiser', { dansDialogue: false });
  await attendreReseau();
  verifier(await kpiContient(formate(totalTout)), 'Dépenses : « Réinitialiser » rétablit toutes les périodes', formate(totalTout));
  // Période et rémunérations
  await aller('/salaires');
  await choisirFiltre('Période', 'Période personnalisée');
  await regler('input[aria-label="Date de début"]', '2025-09-01');
  await regler('input[aria-label="Date de fin"]', '2025-09-30');
  await pause(1200);
  await attendreReseau();
  const salairesSept = (await api('GET', '/salaires/?date_debut=2025-09-01&date_fin=2025-09-30')).donnees.filter((x) => x.statut !== 'ANNULEE');
  const dusSept = salairesSept.reduce((t, x) => t + x.montant_du, 0);
  await page.waitForFunction((t) => document.querySelector('main').innerText.replace(/[\u202f\u00a0\s]+/g, ' ').includes(t), { timeout: 8000 }, formate(dusSept)).catch(() => undefined);
  verifier((await texteMain()).replace(/\s+/g, ' ').includes(formate(dusSept)), 'Salaires : le filtre de période recalcule les indicateurs', formate(dusSept));
  verifier(!/Origine/.test(await texteMain()), 'Salaires : plus de filtre « Origine »');
});

// ------------------------------------------------------------------ Mobile et thème sombre
await etape('Accessibilité : le focus clavier reste dans la fenêtre ouverte', async () => {
  await connexion('admin@allakro.com', 'Allakro@2025');
  await aller('/depenses');
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Nouvelle dépense')).focus());
  await cliquerBouton('Nouvelle dépense', { dansDialogue: false });
  await pause(300);
  let sorti = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) sorti += 1;
  }
  verifier(sorti === 0, 'Fenêtre modale : 30 Tab de suite, le focus ne sort jamais de la fenêtre', String(sorti));
  await page.keyboard.down('Shift');
  let sortiArriere = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) sortiArriere += 1;
  }
  await page.keyboard.up('Shift');
  verifier(sortiArriere === 0, 'Fenêtre modale : 30 Maj+Tab de suite, le focus ne sort jamais de la fenêtre', String(sortiArriere));
  await page.keyboard.press('Escape');
  await pause(400);
  verifier(await page.evaluate(() => document.activeElement?.textContent?.includes('Nouvelle dépense')), 'Fenêtre fermée : le focus revient au bouton qui l’avait ouverte');
});

await etape('Affichage mobile', async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await aller('/salaires');
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  verifier(debord <= 1, 'Mobile : pas de débordement horizontal (Salaires)', `${debord}px`);
  await ecran('10_mobile_salaires', true);
  await aller('/travaux');
  await cliquerBouton('Nouveau travail', { dansDialogue: false });
  await ecran('11_mobile_travail_formulaire');
  await cliquerBouton('Annuler', { exact: true });
  await page.click('button[aria-label="Ouvrir le menu"]');
  await pause(500);
  await ecran('12_mobile_menu');
  await page.setViewport({ width: 1440, height: 900 });
});

await etape('Thème sombre', async () => {
  await aller('/parametres');
  await cliquerBouton('Sombre', { exact: true, dansDialogue: false });
  await pause(300);
  await aller('/salaires');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  verifier(theme === 'dark', 'Thème sombre appliqué', theme);
  await ecran('13_salaires_sombre');
  await aller('/parametres');
  await cliquerBouton('Clair', { exact: true, dansDialogue: false });
  await pause(300);
});

await etape('Travaux : affichage du tableau', async () => {
  await aller('/travaux');
  const debord = await debordementTableaux();
  verifier(debord.every((x) => x <= 1), 'Travaux : tableau sans débordement à 1440 px', debord.join(','));
  await ecran('14_travaux');
});

// ================================================================== Superviseur
await etape('Superviseur : droits', async () => {
  await api('POST', '/auth/logout/');
  await connexion('k.jean@allakro.com', 'Superviseur@2025');
  await aller('/travaux');
  await page.evaluate(() => document.querySelector('table tbody tr button[aria-label="Plus d\'actions"]')?.click());
  await pause(300);
  const elementsMenu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((x) => x.textContent.trim()));
  verifier(elementsMenu.length > 0 && !elementsMenu.includes('Supprimer'), 'Superviseur : pas de « Supprimer » dans le menu des travaux', elementsMenu.join(' | '));
  await page.keyboard.press('Escape');
  const refus = await api('DELETE', `/travaux/${contexte.travailSeul.id}/`);
  verifier(refus.statut === 403 || refus.statut === 404, 'API : suppression refusée au superviseur (403, ou 404 hors de son campement)', String(refus.statut));
  const menu = await page.evaluate(() => document.querySelector('aside nav').innerText);
  verifier(!menu.includes('Administration') && menu.includes('Paramètres'), 'Superviseur : pas d’Administration, Paramètres visible');

  // Périmètre : un superviseur ne voit que le campement de sa fiche (Jean Kouassi : Campement Nord)
  const moi = (await api('GET', '/auth/me/')).donnees;
  const camps = (await api('GET', '/campements/')).donnees;
  verifier(camps.length === 1, 'Superviseur : un seul campement visible (le sien)', camps.map((c) => c.nom).join(','));
  const tousBlocs = (await api('GET', '/blocs/')).donnees;
  verifier(tousBlocs.length > 0 && tousBlocs.every((b) => b.campement_id === camps[0].id), 'Superviseur : seuls les blocs de son campement', String(tousBlocs.length));
  const depenses = (await api('GET', '/depenses/')).donnees;
  verifier(depenses.every((d) => d.campement_id === camps[0].id), 'Superviseur : seules les dépenses de son campement', String(depenses.length));
  verifier((await api('GET', '/tableau-de-bord/?campement_id=999999')).statut === 403, 'Superviseur : tableau de bord d’un autre campement refusé (403)');
  verifier((await api('GET', '/rapport/?campement_id=999999')).statut === 403, 'Superviseur : rapport d’un autre campement refusé (403)');
  verifier((await api('POST', '/plantations/', { nom: 'Pirate', superficie: 1 })).statut === 403, 'Superviseur : création de plantation refusée (403)');
  verifier((await api('POST', '/campements/', { nom: 'Pirate', plantation_id: camps[0].plantation_id, superficie: 0, responsable_id: moi.personne_id })).statut === 403,
    'Superviseur : création de campement refusée (403)');
  // Un responsable crée les blocs de SON campement et y enregistre des personnes (au niveau du campement)
  const blocSup = await api('POST', '/blocs/', { nom: 'Bloc Responsable E2E', campement_id: camps[0].id, superficie: 1, nombre_plantes: 10 });
  verifier(blocSup.statut === 201, 'Responsable : création d’un bloc dans son campement', String(blocSup.statut));
  const ouvrierSup = await api('POST', '/personnes/', { nom: 'OuvrierE2E', prenom: 'Resp', telephone: '07 90 90 90 90', fonction_libelle: 'Manœuvre', campement_id: camps[0].id });
  verifier(ouvrierSup.statut === 201 && !ouvrierSup.donnees.bloc_id && ouvrierSup.donnees.campement_id === camps[0].id,
    'Responsable : ouvrier enregistré au niveau du campement (sans bloc)', String(ouvrierSup.statut));
  verifier((await api('GET', '/utilisateurs/')).statut === 403 && (await api('GET', '/journal/')).statut === 403, 'Superviseur : utilisateurs et journal refusés (403)');
  // Pages de structure en lecture seule
  await aller('/plantations');
  const boutons = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).filter((t) => /^Nouvelle plantation/.test(t)));
  verifier(boutons.length === 0, 'Superviseur : pas de bouton « Nouvelle plantation »');
  // Sécurité du navigateur : le jeton de session n'est pas lisible par les scripts de la page
  const lisibles = await page.evaluate(() => document.cookie);
  verifier(!/allakro_access|allakro_refresh/.test(lisibles), 'Cookies de session httpOnly : invisibles pour JavaScript', lisibles.replace(/csrftoken=[^;]*/, 'csrftoken=…'));
  // CSRF : une requête qui modifie des données sans le jeton est refusée
  const sansJeton = await api('POST', '/depenses/', { designation: 'x' }, { sansCsrf: true });
  verifier(sansJeton.statut === 403 && sansJeton.donnees?.code === 'csrf', 'CSRF : requête sans jeton refusée (403)', JSON.stringify(sansJeton.donnees));
  // En-têtes de sécurité de l'API
  const entetes = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/me/', { credentials: 'include' });
    return ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].map((n) => r.headers.get(n));
  });
  verifier(entetes.every(Boolean) && entetes[0].includes("default-src 'none'"), 'En-têtes de sécurité présents sur l’API (CSP, nosniff, anti-cadre, referrer)', entetes.join(' | ').slice(0, 120));
  // Déconnexion : le jeton est révoqué, la session ne revient pas
  await api('POST', '/auth/logout/');
  verifier((await api('GET', '/auth/me/')).statut === 401, 'Après déconnexion, la session est refusée (401)');
  verifier(moi.role === 'superviseur', 'Compte superviseur confirmé');
});

// ================================================================== Limitation des tentatives de connexion
await etape('Anti brute force', async () => {
  await api('POST', '/auth/logout/');
  const statuts = [];
  for (let i = 0; i < 7; i++) {
    const r = await api('POST', '/auth/login/', { username: 'inconnu.e2e@allakro.com', password: 'mauvais-mot-de-passe' });
    statuts.push(r.statut);
  }
  verifier(statuts.includes(429), 'Connexion : blocage après plusieurs échecs (429)', statuts.join(','));
});

verifier(erreursServeur.length === 0, 'Aucune erreur serveur (5xx)', erreursServeur.join(' | '));
verifier(erreursJs.length === 0, 'Aucune erreur JavaScript dans la page', erreursJs.slice(0, 5).join(' | '));
await page.close();
await navigateur.disconnect();
const echecs = resultats.filter((r) => r[0] !== 'OK');
console.log(`\n${resultats.length - echecs.length} vérifications réussies, ${echecs.length} échec(s)`);
for (const e of echecs) console.log(' -', e[1], ':', e[2]);
