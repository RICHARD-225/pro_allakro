# ALLAKRO — Contexte complet du projet (pour reprendre le travail)

> **À lire en premier par tout agent ou développeur qui reprend ce projet.** Ce fichier réunit le contexte, les règles, les conventions, les pièges et l'état exact d'avancement. Il complète `ALLAKRO_DOC.md` (référence technique et métier détaillée), `ALLAKRO_MODIFICATIONS.md` (détail des modifications du 11 octobre 2026 et questions ouvertes) et `outils_tests\README.md` (comment tester).
> **Dernière mise à jour : 12 octobre 2026**, après la série « fonctions demandées » (Redis, mot de passe oublié, notifications, clôture mensuelle, pagination serveur, sauvegardes chiffrées). Après toute évolution : mettre à jour ce fichier (partie 9) et `ALLAKRO_DOC.md` (méthode en partie 7 de ce dernier).

---

## 1. Le projet en dix lignes

- **ALLAKRO** : application web (PWA installable) de **gestion de plantations** (hévéa : saignée, ramassage…) : exploitation (plantations → campements → blocs), personnel, **travaux** réalisés par des équipes, **salaires** (rémunérations, avances, paiements, reçus), **dépenses**, **stock**, **achats à des particuliers**, tableau de bord, bilan mensuel, **rapport Excel**.
- **Propriétaire / utilisateur : Richard** (dépôt GitHub `RICHARD-225/pro_allakro`). Il écrit **en français**, par messages courts et parfois approximatifs ; il attend des **fonctionnalités complètes, reliées jusqu'à PostgreSQL et vérifiées de bout en bout**, une interface **propre, claire, simple, sans débordement ni encombrement**, et des actions simples.
- **Stack :** Django 6.1.1 + Django REST Framework + PostgreSQL 18 (backend) ; React 18 + Vite 7 + Tailwind CSS 3 + Recharts + lucide-react (frontend, police Inter servie localement). Python 3.14, Node 22.
- **Deux rôles :** **Big Boss** (tous les droits, seul à supprimer) et **Superviseur** (crée, modifie, annule ; ne supprime pas).
- **Données réelles :** la base `allakro_db` contient les saisies de l'utilisateur. Elle est **utilisée en direct** (serveurs 8000 et 5173 de l'utilisateur) : ne jamais la vider ni y lancer `seed_allakro --reset`.
- **Langue du code :** noms de modèles, champs, messages et commentaires **en français** (conserver).

---

## 2. Règles de conduite avec l'utilisateur et la machine

À respecter systématiquement (ce sont des consignes explicites de l'utilisateur ou de la session) :

1. **Ne jamais afficher les valeurs du fichier `backend\.env`** (secrets). Ne jamais envoyer l'e-mail de l'utilisateur à un service tiers.
2. **Ne pas committer ni pousser** sans demande explicite. Le dossier est un dépôt Git (`main`, relié à GitHub). `.gitignore` exclut notamment `backend\.env`, `backend\requirements.txt`, `ALLAKRO_DOC.md`, `.claude\`, `node_modules\`, `dist\` et les sorties de `outils_tests`.
3. **Ne pas toucher aux serveurs de l'utilisateur** : Django sur le port **8000**, Vite sur **5173**. Ne tuer que des processus dont on a vérifié la ligne de commande (les nôtres : ports 8001, 5180, 9333).
4. **Sauvegarder avant toute opération sur les données** (`pg_dump` dans `C:\Users\HP\Desktop\alakro_sauvegardes\`), essayer la migration sur une **copie restaurée** (`outils_tests\pg_outils.py copier`), puis l'appliquer à `allakro_db`. Les migrations déjà passées sont listées en partie 3.11 de `ALLAKRO_DOC.md`.
5. **Ne rien supprimer de réel sans décision** (ex. la table `prevision`, 8 lignes, est conservée sans écran). Préférer annuler / désactiver à supprimer ; conserver l'historique financier.
6. **Tester pour de vrai** avant de dire « terminé » : tests backend, build, test de bout en bout dans le navigateur, captures relues à 1 440 px et 390 px. Dire clairement ce qui n'a pas été testé.
7. **Mettre à jour la documentation** (`ALLAKRO_DOC.md`, `ALLAKRO_MODIFICATIONS.md`, ce fichier, la mémoire) après chaque évolution.
8. Répondre **en français**, de façon concise, en listant ce qui est fait, vérifié, et les décisions qu'il reste à prendre.
9. N'utiliser des sous-agents / workflows que si l'utilisateur le demande : une tentative de travail réparti par workflow s'est arrêtée sur la limite de session du compte (le travail a dû être terminé et relu à la main).

---

## 3. Environnement de travail (Windows)

| Élément | Valeur |
|---|---|
| Dossier du projet | `C:\Users\HP\Desktop\alakro\` |
| Python | `env\Scripts\python.exe` (venv) ; mettre `PYTHONUTF8=1` en cas d'erreur d'accents |
| PostgreSQL | v18, `localhost:5432`, base `allakro_db` ; binaires `C:\Program Files\PostgreSQL\18\bin` ; identifiants dans `backend\.env` (ne pas les afficher) |
| Shell | PowerShell et Git Bash. **Piège :** les commandes contenant des heredocs avec beaucoup de guillemets cassent parfois dans l'outil ; pour un script Python ou du CSS un peu long, l'écrire dans un fichier (outil d'écriture) puis l'exécuter |
| Navigateur de test | Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, lancé sans fenêtre sur le port de débogage **9333** et piloté par `puppeteer-core` |
| Sauvegardes | `C:\Users\HP\Desktop\alakro_sauvegardes\` (fichiers `pg_dump`, dont `allakro_db_avant_annulation_paiements_20261011_0224.dump` avant la migration 0007) |
| Mémoire de l'agent | `C:\Users\HP\.claude\projects\c--Users-HP-Desktop-alakro\memory\` (`MEMORY.md` = index ; règles métier, document de référence, dépôt GitHub, interface sobre) |
| Ancienne copie à ne plus utiliser | `C:\Users\HP\Desktop\project\` (frontend sur données fictives) |

### Lancer le projet (développement)

```powershell
# Terminal 1 — API Django (http://localhost:8000)
cd C:\Users\HP\Desktop\alakro\backend
..\env\Scripts\python.exe manage.py migrate
..\env\Scripts\python.exe manage.py runserver

# Terminal 2 — interface (http://localhost:5173, redirige /api vers Django)
cd C:\Users\HP\Desktop\alakro\frontend
npm install        # première fois
npm run dev
```

Comptes de démonstration (base rechargée par `seed_allakro`) : `admin@allakro.com` / `Allakro@2025` (Big Boss), `k.jean@allakro.com` / `Superviseur@2025` (Superviseur). Ils ne servent **qu'aux bases de démonstration** ; ceux de `allakro_db` sont ceux de l'utilisateur.

Commandes utiles (depuis `backend\`) : `manage.py check` ; `manage.py makemigrations --check --dry-run` ; `manage.py test apps --parallel 1` (environ 5 minutes ; crée une base de test PostgreSQL) ; `manage.py seed_allakro [--reset]` (⚠ `--reset` efface tout) ; `manage.py generer_remunerations [--appliquer]`. Depuis `frontend\` : `npm run build`.

---

## 4. Architecture

### 4.1 Backend (`backend\`)

```
PRoAll\            settings.py, urls.py (routes racine)
apps\
  accounts\        utilisateurs, rôles, journal, authentification (cookies httpOnly), audit.py (BaseViewSet !), limitation.py (anti force brute)
  core\            plantations, campements (responsable), blocs (nombre de plantes), personnes, fonctions, équipes (lecture seule),
                   utils.py (codes auto, périodes, normalisation, montant_en_lettres), validators.py, services.py, testing.py (base des tests),
                   management\commands\seed_allakro.py (données de démonstration)
  exploitation\    activités (types de travail), travaux, participants ; services.py (équipe + rémunération d'un travail) ;
                   management\commands\generer_remunerations.py
  finances\        catégories, dépenses, salaires (= rémunérations), paiements (annulables), prévisions (table conservée, sans API) ;
                   paiements.py (TOUTES les règles de paiement), calculs.py (statuts, situation après paiement), recus.py (PDF),
                   historique.py, tableau_de_bord.py, rapports\ (Excel : donnees.py, classeur.py, perimetre.py)
  stock\           produits, mouvements ; achats\ vendeurs (particuliers), achats, règlements
```

**Conventions backend (à suivre) :**

- Tout ViewSet hérite de `accounts/audit.py : BaseViewSet` : authentification, **journal d'audit automatique**, suppression réservée au Big Boss, filtres `filter_map`, **période** (`periode=AAAA-MM`, ou `date_debut` / `date_fin` sur `periode_field`), **tri par défaut `ordre_defaut`** (`-date_creation, -id`, ou `-id` sans date de création ; exception : Activités = ordre métier). Un `annotate()` fait perdre le `Meta.ordering` : l'ordre est donc toujours posé par `ordre_defaut`.
- **Validation et calculs côté serveur** (serializers + `core/validators.py`), messages en français rattachés au bon champ (`xxx_id`). L'interface ne fait qu'un aperçu.
- **Montants** : `transaction.atomic` + `select_for_update(of=('self',))`. **Règles de paiement uniquement dans `finances/paiements.py`** ; équipe et rémunération d'un travail uniquement dans `exploitation/services.py`.
- **Un paiement annulé (`annule=True`) ne compte nulle part** : toute somme du « payé » doit l'exclure (`paiements.montant_paye`, `calculs.annoter_salaires`, serializers, tableau de bord, rapports, historique, reçu).
- Codes automatiques via `AutoCodeMixin` (PLT-, CMP-, BLC-, MAT-, EQ-, TRV-, CAT-, PRD-, ACH-, PAY-). Doublons garantis par **contraintes PostgreSQL**.
- Migrations en **trois temps** quand des données existent : schéma → reprise (`RunPython`) → contraintes.
- Tests dans le `tests.py` de chaque application, avec `apps/core/testing.py` (`ApiTestCase` : connexion, référentiel, `creer_travail`).

### 4.2 Frontend (`frontend\src\`)

```
api\client.js          HTTP, session par cookies, renouvellement automatique, erreurs par champ (ApiError.fields), téléchargements
services\index.js      un service par ressource de l'API (CRUD + actions : annuler, retablir, annuler paiement…)
pages\                 une page par écran (Travaux, Salaires, Dépenses, Stock, Bilan, Dashboard, Personnes…)
components\ui\         DataTable (listes encadrées), Modal, Select, Filtres, FiltrePeriode, KpiGrid, PlusDOptions, BarresHorizontales,
                       RepartitionDepenses, DonutChart, ConfirmDialog…
components\            RowActions (menu « ⋯ »), TravailDetail, PersonneDetail, BlocPicker, ReferentielPage
components\salaires\   PaiementModal, NouveauPaiementModal (liste + « Payer »), RemunerationModal (création seule), SalaireDetail,
                       RecusModal, RecuPaiement (reçu : aperçu = impression), ApercuRecuModal
hooks\                 useSuppression (confirmation), useStyleGraphique (couleurs des graphiques selon le thème), useDashboardData
contexts\              Auth, Toast, Filter, Theme            utils\ format.js (montants, dates, montantEnLettres), errors.js
index.css              classes de composants, thème sombre, styles du reçu et de l'impression (#zone-impression)
```

**Conventions frontend (à suivre) :**

- **Une page de liste** = `DataTable` (recherche, filtres dans la barre, tri, pagination, cartes sur téléphone) + `RowActions` (actions principales visibles, le reste dans « ⋯ ») + `useSuppression` pour toute suppression ou annulation **avec confirmation** + `showServerErrors`. Un **clic sur une ligne** ouvre la fiche, sinon la modification. Une liste vide propose le bouton de création. Les champs facultatifs sont dans `PlusDOptions`.
- Les composants d'actions de ligne passés à `DataTable` sont des **fonctions pures** (pas de hooks), appelées comme des fonctions.
- Typographie : Inter, rien sous 11 px, casse normale, chiffres tabulaires, texte lisible au moins en `ink-500`, champs en 16 px sur téléphone. Tester **1 440 px et 390 px**, clair et sombre, **aucun débordement horizontal**.
- Filtre de période : `FiltrePeriode` + `plagePeriode()` → paramètres `date_debut` / `date_fin` envoyés à l'API (la liste est rechargée).
- Reçu : `RecuPaiement` sert à l'aperçu (fenêtre) **et** à l'impression (`imprimerRecu` le dessine dans `#zone-impression`, seul élément visible en `@media print`).

---

## 4 bis. Base de données : état et commandes de contrôle

- `allakro_db` (celle de l'utilisateur, ports 8000 / 5173) a été **remise à zéro le 11 octobre 2026** à sa demande : jeu propre de **3 lignes par élément** (voir `ALLAKRO_DOC.md` 3.14), les deux comptes (admin Big Boss, Jean Kouassi superviseur) conservés. Sauvegardes dans `C:\Users\HP\Desktop\alakro_sauvegardes\` (`allakro_db_avant_remise_a_zero_*.dump` = état d'avant).
- `python manage.py verifier_coherence` : recalcule tous les chiffres (travaux, rémunérations, paiements ↔ dépenses, achats, stock, tableau de bord de chaque mois) et échoue au moindre écart. **À lancer après toute modification des calculs** (et en fin de `reinitialiser_base`).
- `python manage.py reinitialiser_base --confirmer` : **destructif** (efface les données métier hors comptes, recharge le jeu propre). Toujours sauvegarder avant (`outils_tests\pg_outils.py sauvegarder`), répéter d'abord sur une copie (`copier` vers `allakro_demo`).

---

## 4 ter. Sécurité (12 octobre 2026) — à respecter pour toute évolution

- **CSRF** : tout POST / PATCH / PUT / DELETE de l'API exige `X-CSRFToken` (cookie `csrftoken`) ; l'interface le fait via `frontend/src/api/client.js`. Les scripts qui appellent l'API doivent faire de même (voir `outils_tests/e2e_complet.mjs`, helper `api`).
- **Sessions** : jetons en cookies httpOnly ; déconnexion et rotation révoquent (table `jeton_revoque`) ; `utilisateur.token_version` à incrémenter (`jetons.invalider_sessions`) quand un compte change de mot de passe / rôle / état.
- **Périmètre par campement** : un superviseur ne voit que le campement de sa fiche (`Utilisateur.campements_autorises()`). Tout nouveau viewset qui expose des données d'un campement **doit** définir `perimetre_lookup` (ou redéfinir `perimetre()`) dans `BaseViewSet` ; tout nouvel écran de synthèse doit passer par `accounts.permissions.forcer_perimetre`. La structure (plantations, campements, activités, catégories) = Big Boss (`big_boss_actions`).
- **CSP** : l'API répond `default-src 'none'` ; l'interface de production n'autorise aucun script en ligne ni externe : ne pas ajouter de script ou de ressource venant d'ailleurs sans mettre à jour `vite.config.js` et `deploy/nginx.conf`.
- **Base** : les contraintes `CHECK` refusent les montants et quantités aberrants : tester toute nouvelle règle avec elles.
- **Mots de passe** : 10 caractères, minuscule + majuscule + chiffre.
- **Outils** : `npm run lint` (ESLint) avant chaque envoi ; `pip-audit` et `npm audit --omit=dev` ; sauvegarde automatique `deploy/sauvegarde_postgres.py` (tâche planifiée « ALLAKRO sauvegarde PostgreSQL ») ; mise en production : `deploy/DEPLOIEMENT.md`.
- **Dev** : l'origine de l'interface doit figurer dans `CSRF_TRUSTED_ORIGINS` (par défaut = `CORS_ALLOWED_ORIGINS` du `.env`) ; pour les tests navigateur sur un autre port, la passer en variable d'environnement au serveur.
- État réel et ce qui reste à faire : `ALLAKRO_MODIFICATIONS.md` parties 10 et 11.

## 4 quater. Services et fonctions ajoutés le 12 octobre 2026

- **Docker Desktop doit tourner** pour Redis (`allakro-redis`, cache des limites de débit, mot de passe dans `CACHE_LOCATION` de `backend/.env`) et Mailpit (`allakro-mail`, boîte de réception de test http://localhost:8025). `deploy/services_dev.ps1` les crée / démarre ; `-Etat` les affiche. Sans Redis, l'application continue (cache tolérant aux pannes, `core/cache.py`). **Ne jamais afficher** les valeurs de `backend/.env` (mot de passe Redis, `SECRET_KEY`, `SAUVEGARDE_CLE`).
- **Pagination serveur** : `?page=` sur dépenses, travaux, salaires, paiements, achats, personnes, mouvements, journal ; sinon liste complète. Une nouvelle liste volumineuse doit déclarer `search_fields`, `ordering_fields`, éventuellement `totaux_agregats` dans le viewset (`accounts/audit.py`, `BaseViewSet`) et utiliser `hooks/useListeServeur.js` côté interface. La recherche sans accent exige l'extension PostgreSQL `unaccent` (migration `core.0008`).
- **Clôture mensuelle** : un mois clos est verrouillé (`finances/clotures.py`, `verifier_ouverte`) : toute nouvelle écriture datée doit appeler `verifier_cloture` / `periode_field`. `verifier_coherence` contrôle l'instantané.
- **Notifications** (`accounts/notifications.py`) : `notifier`, `notifier_big_boss`, `alerte_stock` ; clé unique pour ne pas répéter.
- **Mot de passe oublié** : `accounts/reinitialisation.py` ; jeton haché, 30 min, usage unique ; envoi SMTP via `EMAIL_*` (Mailpit en dev).
- **Sauvegardes** : `deploy/sauvegarde_postgres.py --chiffrer --copie <dossier>` (clé `SAUVEGARDE_CLE`, à conserver aussi hors de la machine) ; tâche planifiée quotidienne vers `C:\Users\HP\OneDrive\Sauvegardes ALLAKRO`.
- **Test d'intrusion interne** : `outils_tests/pentest.py` (instance en mode production sur le port 8002) ; ce n'est pas un test externe indépendant.
- **Non fait** (à ne pas annoncer comme fait) : double authentification (reportée par l'utilisateur), test d'intrusion externe, envoi réel de courrier, vérification de la synchronisation OneDrive, CI GitHub jamais exécutée, mise en ligne.

---

## 5. Règles métier à connaître (résumé ; le détail est dans `ALLAKRO_DOC.md` partie 3.5)

- **Tout se saisit sur un bloc** (le campement est déduit). Hiérarchie Plantation → Campement (a un **responsable**) → Bloc. Nombre de plantes obligatoire sur un bloc.
- **Travaux :** activités fixes (OUVERTURES … AUTRE, « AUTRE » exige un nom). L'**équipe se crée dans le travail** (plusieurs personnes → nom d'équipe + **chef** choisi parmi elles ; une seule → **responsable**). **Statut du travail seul** : À venir → En cours → Terminé selon les dates, Annulé à la main. **Le travail n'expose aucun statut de paiement** (seulement `remuneration {id, montant_du}`).
- **Une rémunération par travail** (contrainte base), créée et tenue à jour automatiquement : montant du travail (quantité × prix), au chef ou au responsable. Aucune règle de rémunération configurable (la table `regle_remuneration` est vide et inutilisée). **Une rémunération ne se modifie jamais** (PUT/PATCH → 405) : on corrige le travail, ou on annule puis on ressaisit une saisie manuelle.
- **Annuler un travail** : possible **à tout moment, quel que soit son statut** (cascade atomique : rémunération annulée, **paiements valides annulés** avec le motif « Travail annulé », leurs dépenses supprimées ; historique et journal conservés). **Rétablir** remet le travail, sa rémunération et les paiements annulés avec lui. **Supprimer** (Big Boss) refusé dès qu'un paiement a existé, même annulé. **Tout ce qui est annulé ne compte plus** (totaux, tableau de bord, Excel) et n'est plus payable.
- **Paiements :** liste « Nouveau paiement » = rémunérations à solde positif avec « Payer » ; paiement **partiel** possible, jamais au-delà du reste ; bénéficiaire = chef (par défaut), un membre ou la personne seule ; membres « Payé via le chef d'équipe » ; **référence et observation** stockées. Chaque paiement crée **sa dépense** (catégorie `CAT-SAL`). **Annuler un paiement** : garde l'historique, supprime sa dépense, remonte le reste. Avance à la création du travail = un paiement. **Réactiver un paiement annulé** (`reactiver_paiement` : recrée sa dépense ; refusé si rémunération annulée ou reste insuffisant).
- **Dépenses :** direct (saisie) ou automatique (paiement de salaire, achat). **Statut automatique, deux valeurs : Avance / Payée** (saisie à la main = toujours Payée, champ en lecture seule ; avance = « Avance » tant que la rémunération n'est pas soldée puis « Payée » via `paiements.actualiser_statuts_depenses` ; la dépense d'un achat ne porte que le montant VERSÉ au vendeur, mise à jour à chaque règlement : Avance puis Payée ; aucune dépense tant que rien n'est versé). Supprimer une dépense automatique = annuler le paiement / supprimer l'achat. Filtre de période sur la **date de la dépense**.
- **Stock :** stock = entrées − sorties ± ajustements ; une sortie ne dépasse pas le stock ; on peut supprimer un mouvement (stock annoncé, journal si négatif) et un produit (avec ses mouvements) après confirmation. **« Retirer du stock »** = `actif=False` (le produit ne compte plus, rien n'est supprimé).
- **Tri :** toutes les listes du plus récent au plus ancien (date de création puis identifiant).
- **Achats aux particuliers :** l'exploitation **achète** des produits ; chaque achat crée une dépense `CAT-ACH` et a un reçu PDF.
- **Excel :** un seul classeur (11 feuilles, 10 sans le journal réservé au Big Boss) ; chaque feuille de détail rattache les données au **campement, au responsable du campement et au bloc**.
- **Bilan mensuel :** dépenses du mois par campement, bloc, catégorie et activité (l'activité d'une dépense = celle du travail dont elle paie le salaire, sinon « Hors travaux »).
- **Prévisions :** module retiré le 11 octobre 2026 (table conservée).

---

## 6. Comment vérifier un changement (procédure suivie)

1. `manage.py check` et `makemigrations --check --dry-run` ; `manage.py test apps --parallel 1` (**145 tests**, tous verts à la dernière vérification).
2. `npm run build` dans `frontend\` **et** `npm run lint` (ESLint ; le build Vite **ne détecte pas** un composant ou une constante non importés : l'erreur n'apparaît qu'à l'exécution).
3. Base de démonstration séparée + serveurs 8001 / 5180 + Edge 9333, puis `node outils_tests\e2e_complet.mjs` (**197 vérifications**, tous verts) — marche à suivre dans `outils_tests\README.md`. Recharger la base (`seed_allakro --reset` avec `DB_NAME=allakro_demo`) **avant chaque passage**.
4. Captures (`captures_modif.mjs`, `captures_typo.mjs`) relues à 1 440 px et 390 px ; PDF d'impression du reçu (média « print ») = une page A4.
5. Nettoyer : arrêter 8001, 5180, 9333 (après vérification des lignes de commande), supprimer `allakro_demo`.

Pièges rencontrés :
- Un **onglet Edge resté en arrière-plan** ne dessine pas ses graphiques : fermer les onglets (`/json/close/<id>`), `bringToFront()`.
- Le test de bout en bout **attend des états** (jusqu'à 8 s) plutôt que de supposer ; des attentes fixes ont produit des faux échecs.
- Après 5 échecs de connexion / 20 par adresse IP en 15 minutes, la connexion est bloquée (429) : `seed_allakro --reset` remet le compteur à zéro.
- Un travail créé pour un test porte la date d'aujourd'hui ; les tests de période utilisent le mois en cours ou les dates des données de démonstration (septembre 2025).

---

## 7. Historique du projet (résumé)

| Période | Ce qui a été fait |
|---|---|
| 29 sept. – 5 oct. 2026 | Frontend PWA sur données fictives ; premier écran, thème sombre, menu regroupé |
| 6 oct. | Pages blanches corrigées ; refonte fonctionnelle ; **branchement sur l'API Django / PostgreSQL** ; rapport Excel ; documentation |
| 8 oct. | **Refonte travaux / équipes / salaires** (équipe dans le travail, avance, payé via le chef, reçus PDF, dépense par paiement, personnes uniques, anti force brute, identité verte) ; migrations avec reprise des données |
| 9 oct. | Interface allégée (indicateurs compacts, filtres repliés, menus « ⋯ », cartes mobiles, bilan recentré) |
| 10 oct. | Typographie (Inter servie localement, échelle, casse normale), actions simples (clic sur ligne, « Modifier » dans les fiches, « Plus d'options »), graphiques en barres horizontales |
| 11 oct. (1re série) | Prévisions retirées ; une rémunération par travail, le travail n'a que son statut ; rémunérations non modifiables ; « Nouveau paiement » en liste + « Payer » ; reçu avec aperçu et impression ; tri par création ; filtre de période ; « Origine » remplacée par « Période » ; commande `generer_remunerations` |
| 11 oct. (2de série) | Reçu redessiné (montant en lettres) ; listes encadrées arrondies ; **annulation des paiements** (migration `finances.0007`) ; travail terminé annulable ; suppression d'une dépense automatique, d'un mouvement et d'un produit de stock ; Excel rattaché au campement / responsable / bloc ; bilan par campement, bloc, catégorie, activité ; menus « ⋯ » stables ; scripts de test rangés dans `outils_tests\` |
| 11 oct. (3e série) | Annuler un travail à tout moment (cascade) ; statuts de dépense Avance / Payée (migration `finances.0008`) ; réactiver un paiement ; filigrane PAYÉ ; produit retiré du stock ; Big Boss crée un superviseur et le suit ; commandes `verifier_coherence` et `reinitialiser_base` ; **`allakro_db` remise à zéro** (jeu propre de 3 lignes par élément, comptes conservés) |

Migrations appliquées : core 0001–0006, exploitation 0001–0005, finances **0001–0009**, stock 0001–0003, achats 0001–0004, accounts 0001–0004, core 0001–0007, exploitation 0001–0006.

---

## 8. Ce qui reste ouvert

### Décisions à demander à l'utilisateur (détail dans `ALLAKRO_MODIFICATIONS.md` parties 6 et 8.8, et `ALLAKRO_DOC.md` partie 6)

- **14 travaux de `allakro_db` sans rémunération** (migrés le 6 oct.) : les générer ? (risque de double emploi avec 31 rémunérations saisies à la main ; `generer_remunerations` simule d'abord).
- **Règles de rémunération configurables** (tarifs, parts d'équipe, ponction) : aujourd'hui, montant du travail versé en entier au chef ; ponction non modifiable.
- Garder la **saisie manuelle** d'une rémunération ? **Paiement groupé** à rétablir dans l'interface ?
- **Table `prevision`** (8 lignes) : supprimer (migration) ou archiver ?
- **Date de création** à ajouter aux paiements, achats, produits, mouvements, catégories, fonctions ? (tri par identifiant aujourd'hui).
- **Annulation d'un paiement** : réserver au Big Boss ? « Rétablir » ? Faire figurer les paiements annulés dans l'Excel ? Suppression d'un mouvement rendant le stock négatif : OK ?
- **Troisième série** : questions tranchées le 11 oct. 2026 (dépense d'achat = montant versé en « Avance » ; annuler / réactiver un paiement permis aux deux rôles ; rétablir un travail réactive ses paiements) — voir `ALLAKRO_MODIFICATIONS.md` 9.8.
- Suppression d'un travail ayant une rémunération non payée : l'autoriser (état actuel) ou imposer l'annulation ?

### Feuille de route (`ALLAKRO_DOC.md` partie 5)

1. **Droits par campement** pour les superviseurs (filtrer côté serveur, refuser hors périmètre) ; fixer le rôle exact du Big Boss.
2. **Mise en production** : HTTPS, `DEBUG=False`, nouvelle `SECRET_KEY`, sauvegardes automatiques de PostgreSQL, vrais comptes, versionner `requirements.txt` et figer les versions, nettoyer les restes (`db.sqlite3`, `apps/accounts/backends.py`, templates inutiles, `frontend/src/App.tsx`).
3. Finances : paiements des dépenses ordinaires, fournisseurs (`tiers`). (Clôture mensuelle, notifications et ajustements de stock : faits le 12 oct. 2026.)
4. Qualité : garder le test de bout en bout dans le projet (fait : `outils_tests\`), pagination côté serveur quand les volumes augmenteront, focus gardé dans les fenêtres modales.

### Dette connue

- Pagination, recherche et tri côté serveur pour les grandes listes (12 oct. 2026) ; les référentiels restent chargés d'un coup.
- 2 personnes sans bloc et quelques anciens travaux sans responsable dans `allakro_db` (à compléter depuis l'interface).
- « Se souvenir de moi » sans effet réel ; notifications par interrogation toutes les 60 s (pas de poussée) ; mot de passe oublié testé avec Mailpit seulement.
- Impression : testée par le PDF d'impression du navigateur, pas sur une imprimante.

---

## 9. Tenir ce fichier à jour

À chaque évolution :
1. mettre à jour `ALLAKRO_DOC.md` (parties 3, 5, 8 et la date), et `ALLAKRO_MODIFICATIONS.md` s'il s'agit d'une série de modifications ;
2. refléter ici : les nouveaux fichiers ou conventions (parties 4 et 5), l'historique (partie 7), les questions ouvertes (partie 8), le nombre de tests (partie 6) ;
3. mettre à jour la mémoire (`memory\`) si une règle métier ou une préférence de l'utilisateur change.
