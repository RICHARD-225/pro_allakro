# Outils de vérification d'ALLAKRO

Scripts pour tester l'application **dans un vrai navigateur** (Edge sans fenêtre) contre la vraie API Django, sur une **base de démonstration séparée** (jamais `allakro_db`). Voir `../contexte.md` (partie 6) pour la marche à suivre complète.

| Fichier | Rôle |
|---|---|
| `e2e_complet.mjs` | Test de bout en bout (197 vérifications) : travaux, salaires, paiements, reçus (aperçu, impression), annulations, suppressions, dépenses, stock, bilan, droits du superviseur, mobile, thème sombre. Affiche `OK` / `ÉCHEC` et un total. |
| `captures_modif.mjs` | Captures des écrans de paiement et de reçu (bureau 1 440 px et mobile 390 px) et PDF d'impression du reçu. |
| `captures_serie3.mjs` | Captures de la troisième série (utilisateurs : création et suivi, dépenses, stock, paiements, travaux) à 1 440 px et 390 px, avec mesure du débordement horizontal. |
| `captures_typo.mjs` | Captures de toutes les pages et des principaux formulaires, bureau et mobile. |
| `pentest.py` | Test d'intrusion **automatisé interne** (77 contrôles : authentification, injections SQL, XSS, CSRF, accès entre rôles, limites de débit, en-têtes, chemins, entrées malformées) contre une instance en mode production sur le port 8002. Ce n'est **pas** un test indépendant : il ne remplace pas un audit par un tiers. |
| `captures_comparaison.mjs` + `comparer_captures.py` | Captures de 18 pages (bureau/mobile, clair/sombre) puis comparaison pixel à pixel de deux versions de l'interface (ex. avant/après une mise à jour de Tailwind). |
| `verif_exploitation.mjs` | Parcours « Exploitation » dans le navigateur : arbre, création plantation → campement (avec nouveau responsable) → bloc, fiches, anciennes adresses, déconnexion avec confirmation, vue d'un responsable (27 vérifications). |
| `verif_roles.mjs` | Vérifie dans le navigateur : responsables de campement proposés, bouton « voir le mot de passe », droits du superviseur (aucun bouton de structure, **et les listes s'affichent bien**). |
| `balayage_pages.mjs` | Ouvre toutes les pages avec un Big Boss puis un superviseur et signale toute réponse d'erreur de l'API (un superviseur ne doit déclencher aucun 403 sur ses pages) ou toute page « erreur ». |
| `simuler_render.py` | Simule en local le démarrage de l'API sur Render (base vide, `DATABASE_URL`, migrations, comptes Big Boss, connexion). |
| `lancer_serveurs_test.ps1` / `arreter_serveurs_test.ps1` | Démarrent / arrêtent les serveurs de test (Django 8001, interface 5180, Edge 9333). |
| `pg_outils.py` | Sauvegarde `pg_dump`, copie, création et suppression d'une base PostgreSQL (sans afficher les identifiants). |

## Préparer

```powershell
cd C:\Users\HP\Desktop\alakro\outils_tests
npm install                                   # une fois (puppeteer-core, sans téléchargement de navigateur)

# 1. Base de démonstration (jamais allakro_db)
..\env\Scripts\python.exe pg_outils.py creer allakro_demo
cd ..\backend
$env:DB_NAME='allakro_demo'; $env:PYTHONUTF8='1'
$env:CSRF_TRUSTED_ORIGINS='http://localhost:5180'   # origine de l'interface de test (protection CSRF)
..\env\Scripts\python.exe manage.py migrate
..\env\Scripts\python.exe manage.py seed_allakro            # avec --reset pour la recharger (efface tout !)
..\env\Scripts\python.exe manage.py runserver 127.0.0.1:8001 --noreload     # terminal 1 (laisser ouvert)

# 2. Interface sur le port 5180, branchée sur ce serveur (autre terminal)
cd ..\frontend
$env:VITE_BACKEND_URL='http://127.0.0.1:8001'
node node_modules/vite/bin/vite.js --port 5180 --strictPort     # terminal 2 (lancer depuis frontend\ !)

# 3. Edge sans fenêtre, port de débogage 9333
Start-Process 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless=new','--remote-debugging-port=9333','--no-first-run','--disable-gpu','--user-data-dir=C:\Temp\edge-profil-allakro','about:blank' -WindowStyle Hidden
```

Les ports **8000 et 5173** sont ceux de l'utilisateur : ne jamais les arrêter ni les utiliser.

## Lancer

```powershell
cd C:\Users\HP\Desktop\alakro\outils_tests
node e2e_complet.mjs                 # recharger la base avant : manage.py seed_allakro --reset (avec DB_NAME=allakro_demo)
node captures_modif.mjs captures_x   # images dans outils_tests\captures_x\
cd ..rontend; npm run lint        # ESLint : détecte les identifiants non importés (le build Vite ne les voit pas)
```

Les comptes de démonstration sont `admin@allakro.com` / `Allakro@2025` (Big Boss) et `k.jean@allakro.com` / `Superviseur@2025`.

## À savoir

- Recharger la base (`seed_allakro --reset`) **avant chaque passage** du test de bout en bout : il crée des données et teste le blocage de connexion (5 échecs = blocage 15 minutes ; `--reset` remet ce compteur à zéro).
- Fermer les onglets restés ouverts dans Edge entre deux essais (`http://127.0.0.1:9333/json/close/<id>`) : un onglet en arrière-plan ne dessine pas ses graphiques.
- Après les essais : arrêter le serveur 8001, Vite 5180 et Edge 9333, puis `python pg_outils.py supprimer allakro_demo`.
- Les dossiers `ecrans_e2e`, `telechargements_e2e` et `captures_*` sont créés à côté des scripts (ignorés par Git).
