# ALLAKRO — Modifications du 11 octobre 2026

> Corrections fonctionnelles et règles de gestion demandées le 11 octobre 2026 : modules Prévisions, travaux, rémunérations, paiements et reçus, tri des listes, périodes.
> Ce document décrit ce qui a changé, où, comment cela a été vérifié, ce qui reste ouvert et les règles à confirmer.
> Le document de référence général reste `ALLAKRO_DOC.md` (mis à jour le même jour).

- **Priorité suivie :** cohérence financière, simplicité d'utilisation, conservation de l'historique.
- **Migrations :** aucune pour la première série ; **une seule pour la seconde** (`finances.0007_paiement_annulation`, trois colonnes ajoutées sur les paiements, voir partie 3). **Aucune donnée existante n'a été supprimée ni modifiée** dans `allakro_db` : tous les essais ont eu lieu sur une base de démonstration séparée.
- **Deux séries le même jour :** parties 1 à 7 = première série ; **partie 8 = seconde série** (reçu redessiné, listes encadrées, annulation des paiements, suppressions, Excel rattaché au lieu, bilan par campement / bloc / catégorie / activité).

---

## 1. Fonctionnalités modifiées

### 1.1 Module Prévisions retiré

- Retiré : l'entrée du menu, la page, la route (l'ancienne adresse `/previsions` renvoie au tableau de bord), le service et l'API (`/previsions/` répond 404), le graphique « Prévu et réalisé » du tableau de bord (les deux graphiques restants, « Travaux par activité » et « Alertes stock », se partagent la ligne), la feuille « Prévisions » et les indicateurs de budget du rapport Excel (11 feuilles au lieu de 12, ou 10 sans le journal), les données de démonstration.
- **Conservé :** le modèle `Prevision` et la table `prevision` avec leurs données (votre base contient **8 prévisions**). Aucune migration, aucune suppression : la table n'est simplement plus exposée. Voir la question Q6.
- Conséquence à connaître : tant que ces 8 lignes existent, elles référencent un campement, un bloc ou une catégorie ; supprimer l'un d'eux est refusé avec le message « utilisé par d'autres enregistrements ». On désactive plutôt (règle déjà en place).

### 1.2 Une rémunération par travail, automatiquement

- **Déjà en place et vérifié :** à l'enregistrement d'un travail (avec au moins une personne), sa rémunération est créée dans Salaires : montant du travail (quantité × prix unitaire), au nom du chef d'équipe ou de la personne seule, même bloc, mêmes dates. Elle suit le travail à chaque modification. **Jamais de doublon** : une contrainte PostgreSQL (une rémunération par travail) l'interdit, et le test enregistre le même travail plusieurs fois.
- **Le travail n'a que son statut opérationnel** (À venir, En cours, Terminé, Annulé). L'API du travail n'expose plus que `remuneration: {id, montant_du}` ; le statut de paiement, le payé et le reste ont disparu de la liste et de la fiche des travaux. La colonne « Statut / paiement » devient « Statut ». Le suivi de la rémunération se fait dans Salaires ; la fiche du travail propose un bouton « Rémunération » qui y renvoie.
- **Annulation d'un travail :** sa rémunération passe en « Annulé » : elle n'est plus payable (l'API refuse un paiement), n'est plus proposée dans « Nouveau paiement », sort des totaux, mais **reste consultable** avec son historique. Le journal garde une ligne « Rémunération … annulée avec le travail » (et « rétablie » si le travail est rétabli).
- **Travaux anciens sans rémunération :** voir la partie 6 (14 travaux de votre base, décision demandée). Une commande fournie les traite sans risque : `manage.py generer_remunerations` (simulation par défaut) puis `--appliquer`.

### 1.3 Annuler ou supprimer un travail

- Depuis la liste **et** depuis la fiche (menu « ⋯ ») : consulter, modifier, annuler / rétablir, supprimer (Big Boss).
- **Annulation :** confirmation claire (« sa rémunération n'est plus payable… »), refusée si le travail est terminé ou a déjà des paiements.
- **Suppression :** confirmation claire et irréversible ; **refusée dès qu'un paiement (avance comprise) est rattaché** (le bouton est grisé avec l'explication, l'API répond 400) : on annule alors le travail. Sans paiement, la rémunération (jamais payée) disparaît avec le travail, et la suppression est tracée au journal. L'API indique `peut_supprimer` et `peut_annuler`.
- Les mouvements de stock ne sont pas rattachés aux travaux dans le modèle actuel : rien à protéger de ce côté.
- Les messages de réussite et d'erreur du serveur s'affichent tels quels.

### 1.4 Paiements

- **Nouveau paiement :** la fenêtre affiche directement la liste des rémunérations à payer (solde positif, hors annulées) avec la personne, la période, le montant de la rémunération, le déjà payé, le reste et un bouton **Payer**. Une recherche retrouve une personne (ou un membre d'équipe), une activité, un bloc, une période. Le bouton ouvre le paiement pré-rempli (bénéficiaire, montant = reste) ; **paiement partiel possible**, jamais au-delà du reste (contrôle dans l'interface et dans l'API, avec verrou en base).
- **Référence et observation (facultatives)** : saisies dans « Plus d'options », **enregistrées par le serveur dans `paiement_salaire`** (colonnes `reference`, `observation`), renvoyées par l'API, affichées dans la fiche de la rémunération, l'aperçu du reçu, le reçu PDF, et modifiables ensuite.
- **Reçu :** après chaque paiement, deux actions distinctes : **Aperçu du reçu** et **Imprimer le reçu** (plus le fichier PDF). Le reçu comporte : ALLAKRO, n° de reçu, bénéficiaire (nom et matricule), période concernée, activité et bloc, montant payé, date, mode, référence, observation, situation après paiement (montant de la rémunération, total payé, **reste à payer** ou « rémunération soldée »), signatures.
- **Impression :** l'aperçu et l'impression utilisent **le même composant et la même feuille de style** : l'aperçu est exactement ce qui sort sur papier. À l'impression, seul le reçu est imprimé (une page A4 portrait, sans menu, bouton ni fenêtre), quel que soit le thème de l'application. Vérifié en générant le PDF d'impression du navigateur (une page).
- Le reçu décrit la situation **juste après le paiement concerné** (un reçu ancien reste exact même si d'autres paiements suivent).
- **Groupement :** l'ancienne sélection de plusieurs rémunérations payées ensemble n'est plus proposée dans l'interface (remplacée par la liste avec « Payer »). L'API `paiements-salaire/lot/` existe toujours. Voir Q5.
- Dans l'onglet « Paiements effectués », un clic sur une ligne ouvre l'aperçu du reçu (qui sert de fiche du paiement, avec « Modifier le paiement »).

### 1.5 Rémunérations non modifiables

- Plus de bouton « Modifier » (liste, fiche), plus de formulaire de modification ; **l'API refuse PUT et PATCH (405)**. La saisie « Nouvelle rémunération » (hors travail) est conservée mais ne se corrige plus : on l'annule (si elle n'a aucun paiement) puis on la ressaisit.
- Une rémunération de travail se corrige **en modifiant le travail** (quantité, prix, personnes) : son montant suit, sans jamais descendre sous ce qui est déjà payé.
- Conséquence : la **ponction** d'une rémunération de travail n'est plus modifiable (elle valait 0). Voir Q4.

### 1.6 Listes triées par création

- Toutes les listes de l'API sont triées par **date de création décroissante, puis identifiant décroissant** (tri stable), côté serveur (`BaseViewSet.ordre_defaut`) : plantations, campements, blocs, personnes, équipes, travaux, dépenses, rémunérations, utilisateurs. Un élément saisi après un autre apparaît avant, même si sa date d'opération est plus ancienne.
- **Modèles sans date de création** (paiements, achats, vendeurs, produits, mouvements de stock, catégories, fonctions) : tri par **identifiant décroissant**, qui reflète exactement l'ordre de saisie (aucune date inventée, aucune migration). Voir Q7.
- **Exception documentée :** la liste des **Activités** garde l'ordre métier fixé (OUVERTURES … AUTRE).
- L'interface n'applique aucun tri par défaut : elle affiche l'ordre du serveur (le tri par colonne reste possible).
- **Listes plus aérées :** lignes plus hautes, marges latérales, en-têtes sur fond doux, cartes de téléphone plus espacées, barre d'outils et pied de tableau plus respirants.

### 1.7 Dépenses par période

- Nouveau filtre **Période** (composant `FiltrePeriode`) : « Période en cours » (mois civil), « Mois précédent », « Période personnalisée » (date de début et date de fin), « Toutes les périodes », et **Réinitialiser**.
- Il est **appliqué par l'API** (`date_debut` et `date_fin`, bornes incluses, sur la **date de la dépense** et non la date de saisie) : la liste est rechargée à chaque choix. Les indicateurs (total, payé, reste) se calculent sur les lignes reçues et rappellent la plage (« du 01 sept. 2025 au 30 sept. 2025 »). Il se combine à la recherche, à la catégorie, au statut et au bloc. Des dates incohérentes sont signalées sans requête.
- Le même filtre existe dans **Salaires** (rémunérations : date de début ; paiements : date de paiement) et fonctionne côté API pour toutes les ressources qui ont une date d'opération (travaux, achats, mouvements de stock…).

### 1.8 « Origine » remplacée par « Période »

- **Constat :** « Origine » n'était **pas une colonne enregistrée** : c'était une valeur calculée (saisie directe, achat, salaire pour les dépenses ; travail ou saisie manuelle pour les rémunérations). Aucune donnée, aucune migration.
- Dépenses : le filtre « Origine » disparaît (remplacé par le filtre Période) ; la colonne « Catégorie / origine » devient « Catégorie / période ». Le numéro du paiement ou de l'achat à la source reste lisible sous la désignation, et le lien « Paiement ↗ » / « Achat ↗ » demeure pour les dépenses automatiques.
- Salaires : le filtre « Origine » disparaît (remplacé par Période) ; la sous-ligne de la rémunération affiche « mois · bloc ».
- La période repose sur des dates (`date_debut`, `date_fin`), jamais sur un texte libre.

### 1.9 Divers

- Les notifications s'affichent en haut sur téléphone (elles masquaient les boutons des fenêtres).
- Version du cache hors ligne : `allakro-v5`.

---

## 2. Fichiers concernés

### Backend (`backend/apps/`)

| Fichier | Changement |
|---|---|
| `accounts/audit.py` | `BaseViewSet` : tri par défaut (`ordre_defaut`), filtres `date_debut` / `date_fin` |
| `accounts/views.py` | Tri des utilisateurs et du journal |
| `core/utils.py` | `parse_date_filtre` |
| `core/views.py` | Tri des plantations, campements, blocs, personnes, équipes |
| `exploitation/views.py` | Tri ; annulation, rétablissement et suppression tracées pour la rémunération ; activités : ordre métier conservé |
| `exploitation/serializers.py` | Le travail n'expose plus de statut de paiement ; `peut_supprimer` |
| `exploitation/management/commands/generer_remunerations.py` | Nouvelle commande (simulation par défaut) |
| `finances/views.py` | API Prévisions retirée ; rémunérations sans PUT / PATCH ; tri ; préchargement |
| `finances/serializers.py` | Prévisions retirées ; rémunération en création seule ; situation après paiement ; référence et observation dans la fiche |
| `finances/calculs.py` | `situation_au_paiement` ; calcul du réalisé des prévisions retiré |
| `finances/recus.py` | Observation et situation après paiement sur le reçu PDF |
| `finances/urls.py`, `finances/tableau_de_bord.py`, `finances/rapports/donnees.py`, `finances/rapports/classeur.py` | Prévisions retirées du tableau de bord et du rapport Excel |
| `finances/models.py` | Commentaire sur `Prevision` (table conservée) |
| `core/management/commands/seed_allakro.py` | Plus de prévisions de démonstration |
| `finances/tests.py`, `exploitation/tests.py` | Tests adaptés et nouveaux |

### Frontend (`frontend/src/`)

| Fichier | Changement |
|---|---|
| `pages/PrevisionsPage.jsx` | **Supprimée** |
| `routes/AppRoutes.jsx`, `components/layouts/Sidebar.jsx`, `services/index.js`, `hooks/useDashboardData.js`, `pages/RapportsPage.jsx`, `pages/DashboardPage.jsx` | Prévisions retirées |
| `pages/TravauxPage.jsx`, `components/TravailDetail.jsx` | Statut du travail seul, annulation et suppression depuis la fiche, lien vers la rémunération |
| `pages/SalairesPage.jsx` | Plus de modification, filtre Période côté serveur, aperçu et impression du reçu, liens `?voir=` et `?payer=` |
| `components/salaires/NouveauPaiementModal.jsx` | Liste des rémunérations à payer avec « Payer » |
| `components/salaires/RemunerationModal.jsx` | Création seule |
| `components/salaires/SalaireDetail.jsx` | Sans « Modifier », référence et observation, aperçu du reçu |
| `components/salaires/RecusModal.jsx` | « Aperçu du reçu », « Imprimer le reçu », « PDF » |
| `components/salaires/RecuPaiement.jsx`, `components/salaires/ApercuRecuModal.jsx` | **Nouveaux** : reçu (aperçu = impression) et sa fenêtre |
| `pages/DepensesPage.jsx` | Filtre Période côté serveur ; plus d'« Origine » |
| `components/ui/FiltrePeriode.jsx` | **Nouveau** : filtre de période réutilisable |
| `components/ui/DataTable.jsx`, `components/ui/index.js` | Listes plus aérées ; export |
| `contexts/ToastContext.jsx` | Notifications en haut sur téléphone |
| `index.css` | Styles du reçu et de l'impression |
| `public/sw.js` | Version du cache |

---

## 3. Migrations créées

**Première série : aucune.** **Seconde série : `finances/migrations/0007_paiement_annulation.py`** — ajoute à `paiement_salaire` trois colonnes (`annule` booléen défaut faux, `date_annulation`, `motif_annulation`) ; rien n'est supprimé ni modifié. Avant de l'appliquer : sauvegarde `pg_dump` de `allakro_db` (`C:\Users\HP\Desktop\alakro_sauvegardes\allakro_db_avant_annulation_paiements_20261011_0224.dump`), essai sur une copie restaurée, puis application à `allakro_db` (48 paiements, aucun annulé). `manage.py makemigrations --check --dry-run` : « No changes detected ». Les colonnes `reference` et `observation` des paiements existaient déjà ; « Origine » n'était pas une colonne ; la table `prevision` est conservée ; le tri utilise `date_creation` (déjà présente) ou l'identifiant.

---

## 4. Tests réalisés et résultats

| Vérification | Résultat |
|---|---|
| Tests automatisés du backend (`manage.py test apps --parallel 1`) | **64 tests sur 64 réussis** (51 avant, 13 ajoutés : tri par création, filtres de période, référence et observation, situation après paiement, annulation et suppression de travaux, rémunération non modifiable, commande de génération, retrait des prévisions) |
| `manage.py check` et `makemigrations --check` | Aucun problème, aucune migration |
| `npm run build` | Build réussi, aucune erreur |
| Test de bout en bout dans le navigateur (Edge sans fenêtre, vraie API, base de démonstration séparée) | **123 vérifications sur 123 réussies**, deux passages consécutifs sur une base rechargée ; aucune erreur serveur (5xx), aucune erreur JavaScript |
| Contrôle dans PostgreSQL (base de démonstration) | Le paiement `PAY-00017` de l'essai figure dans `paiement_salaire` avec `reference = REF-E2E-1` et `observation = Acompte E2E sur le chantier` ; aucun travail n'a plus d'une rémunération (requête de contrôle : 0) |
| Impression | PDF d'impression du navigateur (média « print ») : 1 page A4 ; seul `#zone-impression` reste visible ; fond vert et texte conservés |
| Captures relues | Pages et fenêtres à 1 440 px et 390 px, clair et sombre ; aucun tableau ne déborde à 1 440 px |

Scénarios de la demande (partie 10) :

1. Créer un travail → sa rémunération apparaît (une seule, au bon bénéficiaire, avec l'avance) : **fait**.
2. Pas de doublon (modifications répétées, nouvelle tentative de création manuelle) : **fait** (test et contrainte base).
3. Annuler un travail → rémunération annulée, non payable, hors totaux, historique et journal conservés ; rétablir → de nouveau à payer : **fait**.
4. Nouveau paiement et recherche : **fait**.
5. Paiement avec référence et observation (partiel, puis solde) : **fait**.
6. Présence dans PostgreSQL : **fait** (tableau ci-dessus).
7. Aperçu du reçu et contenu : **fait**.
8. Impression et mise en page : **fait** (PDF d'impression). *Non testé : l'envoi réel à une imprimante, impossible dans un navigateur sans fenêtre.*
9. Modification directe d'une rémunération indisponible : **fait** (interface et API 405).
10. Tri, filtres de période et totaux : **fait** (API et écran).
11. Autres fonctionnalités : **fait** (suite complète, test de bout en bout).
12. Tests disponibles et `npm run build` : **fait**.

Le script de bout en bout reste dans le dossier temporaire de la session (il n'est pas dans le projet, voir `ALLAKRO_DOC.md`, partie 4).

---

## 5. Problèmes restants

- **Impression réelle** non testée sur imprimante ; le rendu a été vérifié par le PDF d'impression du navigateur. Selon l'imprimante, activer « Graphiques d'arrière-plan » pour conserver le bandeau vert.
- **Menu « ⋯ » d'une ligne** : il se referme si la liste se recharge pendant qu'il est ouvert (les actions de ligne sont recréées à chaque affichage de la page). Sans gravité, déjà présent avant ces modifications.
- **Libellé « Période en cours »** : c'est le mois civil en cours (les périodes de l'application sont mensuelles).
- **Listes volumineuses** : recherche et pagination restent dans le navigateur ; seul le filtre de période est appliqué par l'API.
- Les dropdowns de choix (campement, bloc, personne) suivent l'ordre du serveur, donc « le plus récent d'abord » comme les listes.

---

## 6. Règles de gestion à clarifier

| # | Question | Situation actuelle |
|---|---|---|
| Q1 | **Règles de rémunération.** Faut-il des tarifs ou formules propres (par activité, par personne, par jour, parts d'équipe) ? | La table `regle_remuneration` existe mais **est vide et inutilisée**. Aucun tarif n'a été inventé : la rémunération d'un travail vaut son montant (quantité × prix unitaire), versée entièrement au chef ou au responsable. À confirmer ou à préciser. |
| Q2 | **Les 14 travaux sans rémunération** de votre base (migrés le 6 octobre : 11 ont un responsable, 3 n'en ont pas) : faut-il leur générer une rémunération ? | Non fait. Cela ajouterait environ 2,5 millions de FCFA « à payer » et peut faire double emploi avec les 31 rémunérations saisies à la main qui existent déjà. `generer_remunerations` (simulation) liste précisément ce qui serait créé ; les 3 travaux sans responsable demandent d'abord de désigner les personnes. |
| Q3 | **Saisie manuelle d'une rémunération** (hors travail) : la conserver ? | Conservée (création, annulation, suppression Big Boss), mais plus modifiable. Si « les rémunérations viennent uniquement des travaux », on peut aussi retirer cette saisie. |
| Q4 | **Ponction** (retenue sur la rémunération) | Plus modifiable pour une rémunération de travail (valeur 0 par défaut). Faut-il une règle de ponction (taux, motif) ou un mécanisme de correction dédié (ex. ajustement daté) ? |
| Q5 | **Paiement groupé** de plusieurs rémunérations | Retiré de l'interface (remplacé par la liste avec « Payer »). L'API est conservée. Faut-il un moyen de payer plusieurs lignes d'un coup ? |
| Q6 | **Table des prévisions** (8 lignes) | Conservée sans écran. À supprimer définitivement (migration) ou à garder en archive ? |
| Q7 | **Date de création** manquante sur paiements, achats, produits, mouvements de stock, catégories, fonctions | Tri par ordre de saisie (identifiant). Faut-il ajouter une vraie date de création (migration) ? Les lignes déjà saisies recevraient la date de la migration. |
| Q8 | **Activités** | Gardent l'ordre métier fixé (exception au « plus récent d'abord »). OK ? |
| Q9 | **Suppression d'un travail ayant une rémunération non payée** | Autorisée (Big Boss) : la rémunération disparaît avec lui, avec une trace au journal. Faut-il l'interdire dès qu'une rémunération existe et imposer l'annulation ? |

---

## 7. Commandes utiles

```powershell
cd C:\Users\HP\Desktop\alakro\backend
..\env\Scripts\python.exe manage.py generer_remunerations              # simulation : liste ce qui serait créé
..\env\Scripts\python.exe manage.py generer_remunerations --appliquer  # crée les rémunérations manquantes (une par travail)
```

Avant `--appliquer` sur `allakro_db` : sauvegarder la base (`pg_dump`) et trancher la question Q2.

---

## 8. Seconde série (11 octobre 2026, suite)

Demande : reçu « très beau » ; listes encadrées et arrondies ; annuler ou supprimer un travail, annuler un paiement, supprimer une dépense avec confirmation ; Excel rattaché au campement, au responsable et au bloc ; suppression d'un mouvement et d'un produit de stock ; bilan mensuel par campement, bloc, catégorie et activité.

### 8.1 Reçu redessiné

- Bandeau vert dégradé avec logo, titre et numéro en pastille ; **montant en gros avec le montant en lettres** (« Arrêté à la somme de : Douze mille francs CFA »), étiquette **Soldé / Acompte / Avance / Annulé** ; puces date, mode et référence.
- Cartes **Bénéficiaire** (initiales, nom, matricule, rôle d'équipe) et **Rémunération concernée** ; encadré **Situation après ce paiement** (rémunération, total payé, reste) avec **barre d'avancement** ; observation en citation ; signatures sur lignes pointillées ; pied de page.
- Même composant pour l'**aperçu** et l'**impression** (une page A4) ; adapté au téléphone (cartes empilées). Le reçu d'un paiement **annulé** porte un bandeau, un filigrane « ANNULÉ » et un montant barré.
- Le **reçu PDF** affiche lui aussi le montant en lettres, l'observation et la mention « paiement annulé ». La conversion en lettres existe côté interface (`montantEnLettres`) et côté serveur (`montant_en_lettres`), avec les règles du français (« quatre-vingts », « et un », « cents », « un million de francs »).

### 8.2 Listes encadrées

Chaque ligne de tableau est une **carte bordée aux coins arrondis**, séparée de la suivante, sur un fond crème, avec une **barre verte à gauche** qui s'intensifie au survol ; sur téléphone, mêmes cartes avec barre verte. Rien ne déborde à 1 440 px.

### 8.3 Annulations et suppressions (toujours avec confirmation)

| Élément | Annuler | Supprimer |
|---|---|---|
| **Paiement** | **Nouveau.** « Annuler le paiement » (liste « Paiements effectués », fiche de la rémunération, aperçu du reçu), pour les deux rôles. Le paiement **reste dans l'historique** (numéro, reçu marqué annulé, motif), sa **dépense est supprimée**, le **reste à payer remonte**. Il ne compte plus dans les totaux, le tableau de bord, le rapport. Non modifiable ensuite ; la rémunération peut être payée de nouveau. | Big Boss (déjà en place) |
| **Travail** | Possible **même s'il est terminé** (saisie par erreur). S'il a des paiements valides : refus avec la marche à suivre (annuler d'abord les paiements). | Big Boss, tant qu'**aucun paiement n'a existé** (même annulé : l'historique financier est conservé) |
| **Dépense** | — | **Dépense saisie** : Big Boss, confirmation. **Dépense automatique** : « Supprimer » agit sur sa source, après une confirmation qui l'explique : un paiement de salaire est **annulé** (historique conservé), un achat est **supprimé** avec ses règlements |
| **Mouvement de stock** | — | Big Boss. La confirmation annonce le nouveau stock (« passera de 70 à 100 kg ») et avertit s'il deviendrait négatif (le journal le signale ; à corriger par un ajustement) |
| **Produit** | — | Big Boss. Il part **avec tous ses mouvements** (la confirmation en annonce le nombre ; « désactiver » reste possible pour l'archiver) ; la suppression des mouvements est tracée au journal |

Les menus « ⋯ » ne se referment plus d'eux-mêmes quand la page se réaffiche (une notification qui disparaît, une liste qui se recharge).

### 8.4 Excel rattaché au campement, au responsable et au bloc

Les feuilles **Dépenses, Achats particuliers, Rémunérations, Paiements, Travaux, Mouvements de stock** ont maintenant les colonnes **Campement, Responsable du campement, Bloc** (la feuille **Exploitation** gagne « Responsable du campement »). Pour une rémunération ou un paiement sans bloc, le campement de la personne est utilisé. La feuille Dépenses gagne **Période** et **Activité**, et sa colonne « Origine » devient « Source » (saisie directe, achat, salaire). Le **Bilan financier** gagne « Dépenses par bloc » et « Dépenses par activité » ; « Dépenses par campement » indique le responsable. *Le « responsable » est celui renseigné sur le campement (page Campements).*

### 8.5 Bilan mensuel

Nouvelle carte **« Répartition des dépenses »** avec quatre regroupements : **Campement** (avec son responsable), **Bloc** (avec son campement), **Catégorie**, **Activité** — pour chacun : libellé, montant, part en % et barre, avec le total. L'**activité** d'une dépense est celle du travail dont elle paie le salaire ; toute autre dépense est « Hors travaux ». L'API du tableau de bord ajoute `depensesParBloc` et `depensesParActivite`.

### 8.6 Fichiers de la seconde série

- **Backend :** `finances/models.py`, `finances/migrations/0007_paiement_annulation.py`, `finances/paiements.py` (`annuler_paiement`), `finances/views.py` (action `annuler`), `finances/serializers.py`, `finances/calculs.py`, `finances/historique.py`, `finances/recus.py`, `finances/tableau_de_bord.py`, `finances/rapports/donnees.py`, `exploitation/views.py`, `exploitation/serializers.py`, `stock/views.py`, `stock/models.py`, `stock/serializers.py`, `core/utils.py` (`montant_en_lettres`), tests.
- **Frontend :** `components/salaires/RecuPaiement.jsx`, `ApercuRecuModal.jsx`, `SalaireDetail.jsx`, `pages/SalairesPage.jsx`, `pages/DepensesPage.jsx`, `pages/StockPage.jsx`, `pages/TravauxPage.jsx`, `components/TravailDetail.jsx`, `pages/BilanPage.jsx`, `components/ui/DataTable.jsx`, `components/ui/RepartitionDepenses.jsx` (nouveau), `utils/format.js` (`montantEnLettres`), `services/index.js`, `hooks/useDashboardData.js`, `index.css`.

### 8.7 Vérifications de la seconde série

- Tests du backend : **71 tests sur 71 réussis** (nouveaux : annulation d'un paiement et ses effets, droits, travail terminé annulable, protection de l'historique, suppression de produit et de mouvement, répartition du bilan, Excel rattaché, montant en lettres).
- Test de bout en bout dans le navigateur : **155 vérifications sur 155**, dont l'annulation d'un paiement par l'écran (confirmation, base, liste, reçu annulé), l'annulation d'un travail terminé, la suppression d'une dépense de salaire et d'achat, la suppression d'un mouvement et d'un produit, le bilan (4 regroupements comparés à l'API).
- Captures relues à 1 440 px et 390 px (reçu, annulé, listes, bilan, confirmations).
- *Non testé :* l'ouverture du fichier Excel dans Excel lui-même (contrôle du contenu par les tests et par lecture du classeur).

### 8.8 Questions ouvertes de la seconde série

| # | Question | Situation |
|---|---|---|
| Q10 | **Qui peut annuler un paiement ?** | Les deux rôles (comme l'annulation d'un travail) ; la suppression reste au Big Boss. À restreindre au Big Boss ? |
| Q11 | **Rétablir un paiement annulé** | Non prévu : on enregistre un nouveau paiement. Faut-il un « rétablir » ? |
| Q12 | **Suppression d'un mouvement rendant le stock négatif** | Permise après confirmation (demande de la suppression), journalisée. Faut-il l'interdire sauf confirmation renforcée ? |
| Q13 | **Responsable dans l'Excel** | C'est le responsable du campement. Voulez-vous aussi le responsable du travail (chef d'équipe) — déjà dans la feuille Travaux ? |
| Q14 | **Rapport Excel et paiements annulés** | Ils n'y figurent pas (seuls les paiements valides). Les ajouter avec un statut « Annulé » ? |

---

## 9. Troisième série (11 octobre 2026, fin de journée)

Demande : annuler un travail **quel que soit son statut** sans fausser les chiffres ; **base nettoyée** avec des données de test cohérentes (3 lignes par élément) et des chiffres vérifiés ; une donnée **annulée ne compte plus et n'est plus payable** (sauf réactivation) ; paiements annulés **absents de l'Excel** ; **retirer ou supprimer un produit** du stock ; **filigrane « PAYÉ »** sur le reçu ; statut d'une dépense saisie **automatique** (plus de champ) ; **avance → statut « Avance »**, puis « Payée » quand la rémunération est soldée ; uniquement **Avance / Payée** ; le Big Boss **crée un superviseur et le suit**.

### 9.1 Annuler un travail, toujours

- « Annuler le travail » est disponible **dans tous les cas** (à venir, en cours, terminé, payé). L'annulation est une **cascade atomique** : le travail passe à « Annulé », sa **rémunération** est annulée (non payable, hors totaux), ses **paiements valides sont annulés** avec le motif « Travail annulé » et **leurs dépenses disparaissent**. L'historique (paiements, reçus, journal) reste consultable.
- La confirmation l'annonce : « Ses N paiement(s) (montant) sont annulés avec lui… ». L'API du travail expose `nb_paiements` et `montant_paiements`.
- **« Rétablir »** remet en vigueur le travail, sa rémunération **et les paiements annulés avec lui** (motif « Travail annulé ») ; un paiement annulé à la main reste annulé.
- Un paiement annulé se **réactive** à la main : « Réactiver le paiement » (liste des paiements, fiche de la rémunération, aperçu du reçu ; API `POST paiements-salaire/<id>/reactiver/`). Il compte de nouveau, sa dépense est recréée ; refusé si la rémunération est annulée ou si le reste à payer ne suffit plus.
- La suppression d'un travail reste réservée au Big Boss et refusée dès qu'un paiement a existé (historique financier).

### 9.2 Statuts des dépenses : Avance / Payée (migration `finances.0008`)

| Dépense | Statut |
|---|---|
| Saisie à la main | **Payée**, toujours. Le champ « Statut » a disparu du formulaire ; l'API ignore un statut envoyé (champ en lecture seule). |
| Paiement de salaire ordinaire | **Payée** |
| **Avance** (paiement fait à la création du travail) | **Avance** tant que la rémunération n'est pas soldée, puis **Payée** automatiquement (et inversement si un paiement est annulé ou le montant du travail augmente) |
| Achat aux particuliers | La dépense ne porte que **le montant versé** au vendeur (l'avance, puis le cumul des règlements, mis à jour à chaque règlement) : **Avance** tant que l'achat n'est pas soldé, **Payée** ensuite. **Aucune dépense tant que rien n'a été versé.** Le règlement de l'achat reste « Non payé / Partiel / Payé » sur sa propre page. |

Plus de statuts « Non payée » / « Partiellement payée » pour les dépenses. La migration convertit les anciens statuts (non payée, partielle → Avance). Dépenses : indicateurs « Total / Payées / Avances à solder » ; tableau de bord : `depensesAvances` (l'ancien `depensesEnAttente` reste en alias) ; Excel : « Avances (à solder) ».

### 9.3 Cohérence des chiffres et base nettoyée

- Commande **`manage.py verifier_coherence`** : recalcule indépendamment les règles financières et les compare aux valeurs enregistrées et au tableau de bord de chaque mois (montant du travail = quantité × prix ; rémunération = montant du travail ; net = brut − ponction ; payé ≤ net ; un paiement valide ↔ une dépense de même montant, date et statut attendu ; un paiement annulé n'a pas de dépense ; achats ; stock = somme des mouvements et jamais négatif ; sommes du tableau de bord, répartitions = total). Elle échoue au moindre écart.
- Commande **`manage.py reinitialiser_base --confirmer`** : efface **toutes** les données métier (sauf les comptes et leur fiche) et recharge un jeu de **3 lignes par élément** passant par les serializers de l'API, puis lance `verifier_coherence` (voir `ALLAKRO_DOC.md` 3.14 pour le scénario).
- **Exécutée sur `allakro_db` le 11 octobre 2026 à la demande de l'utilisateur**, après sauvegarde `allakro_db_avant_remise_a_zero_*.dump` (dossier `alakro_sauvegardes`). Les deux comptes (admin Big Boss et Jean Kouassi superviseur) sont conservés avec leurs mots de passe. Contrôle : 87 vérifications, aucune incohérence ; chiffres de septembre et d'octobre recalculés à la main (dépenses 795 000 / 375 000, rémunérations dues 575 000 / 150 000, valeur du stock 3 560 000) : conformes.

### 9.4 Excel, stock, reçu

- **Excel :** les paiements annulés n'y figurent pas (déjà le cas, maintenant testé) ; les travaux annulés non plus.
- **Stock :** « **Retirer du stock** » / « **Remettre en stock** » (menu « ⋯ » du produit) archive le produit sans rien supprimer : il ne compte plus dans la valeur du stock, les alertes ni les saisies de mouvements. « Supprimer » (Big Boss) reste possible et supprime le produit avec ses mouvements.
- **Reçu :** filigrane **« PAYÉ »** (vert) quand le paiement solde la rémunération (écran, impression et PDF), « ANNULÉ » (rouge) pour un paiement annulé. Le reçu d'achat porte « PAYÉ » quand l'achat est soldé. Le PDF tient de nouveau sur une page.

### 9.5 Utilisateurs : créer un superviseur et le suivre

- **Création** : prénom, nom, campement / bloc d'affectation, téléphone (facultatif), e-mail, rôle (Superviseur par défaut), mot de passe. La **fiche du personnel est créée en même temps** (fonction « Superviseur »). On peut encore rattacher le compte à une personne déjà enregistrée.
- **Suivi** (clic sur la ligne ou « Suivre l'activité ») : dernière connexion, nombre de connexions, actions au total et sur 7 jours, actions par type, 30 dernières actions du journal ; boutons Modifier et Désactiver / Réactiver. API `GET utilisateurs/<id>/activite/` (Big Boss).

### 9.6 Fichiers de la troisième série

- **Backend :** `finances/models.py`, `finances/migrations/0008_statuts_depenses_avance_payee.py`, `finances/paiements.py` (`reactiver_paiement`, `actualiser_statuts_depenses`), `finances/views.py`, `finances/serializers.py`, `finances/recus.py`, `finances/tableau_de_bord.py`, `finances/rapports/donnees.py`, `achats/serializers.py`, `exploitation/views.py` (annulation en cascade, rétablissement), `exploitation/serializers.py`, `exploitation/services.py`, `accounts/serializers.py` + `views.py` (création de superviseur, `activite`), `core/management/commands/reinitialiser_base.py` et `verifier_coherence.py` (nouveaux), `seed_allakro.py`, tests.
- **Frontend :** `constants/index.js`, `pages/DepensesPage.jsx`, `ParticuliersPage.jsx`, `BilanPage.jsx`, `TravauxPage.jsx`, `StockPage.jsx`, `SalairesPage.jsx`, `UtilisateursPage.jsx` (réécrite), `components/TravailDetail.jsx`, `components/salaires/{RecuPaiement,ApercuRecuModal,SalaireDetail}.jsx`, `services/index.js`, `hooks/useDashboardData.js`, `index.css`.
- **Outils :** `outils_tests/e2e_complet.mjs` (étapes ajoutées), `outils_tests/captures_serie3.mjs` (nouveau).

### 9.7 Vérifications de la troisième série

- Tests du backend : **83 tests sur 83 réussis** (nouveaux : annulation en cascade d'un travail payé et rétablissement, paiement annulé à la main non réactivé, statut Payée forcé, avance → Payée → Avance, réactivation, Excel sans paiement annulé, produit retiré du stock, remise à zéro propre, détection d'un écart par le contrôle, création et suivi d'un superviseur). `makemigrations --check` : aucune migration manquante.
- Test de bout en bout : **181 vérifications sur 181** (dont l'annulation d'un travail payé par l'écran avec sa confirmation, le rétablissement, l'avance qui passe à Payée, la réactivation, le filigrane PAYÉ, le retrait du stock, la création d'un superviseur et sa fiche de suivi).
- `verifier_coherence` : réussi sur la base propre **et** sur le jeu de démonstration complet (278 contrôles).
- Captures relues à 1 440 px et 390 px (suivi, création, dépenses, stock, reçu) : aucun débordement horizontal.
- *Non testé :* ouverture de l'Excel dans Excel ; impression sur une imprimante réelle.

### 9.8 Questions ouvertes de la troisième série

| # | Question | Situation |
|---|---|---|
| Q15 | Statut et montant de la dépense d'un achat non soldé | **Tranché (11 oct. 2026) :** « Avance » et seul le montant versé apparaît, mis à jour à chaque règlement (9.2, migration `achats.0003`). |
| Q16 | Qui peut annuler / réactiver un paiement | **Tranché :** les deux rôles ; la suppression reste au Big Boss. |
| Q17 | « Rétablir » un travail réactive les paiements annulés avec lui | **Tranché :** oui. |
| Q18 | **Journal effacé** par la remise à zéro | Le journal des essais a été supprimé avec les données. |


---

## 10. Série « sécurité renforcée » (12 octobre 2026)

Demande : régler tous les problèmes de sécurité de l'audit et les améliorations citées — HTTPS, CSP, CSRF, injection SQL, XSS, contrôle d'accès — **sans annoncer comme fait ce qui ne l'est pas**. Chaque point ci-dessous est classé : **Fait et testé**, **Fourni, non déployé** (fichier prêt, à mettre en place sur le serveur) ou **Non fait**.

### 10.1 Sécurité (points S1 à S9 de l'audit)

| # | Point de l'audit | État | Ce qui a été fait / vérifié |
|---|---|---|---|
| S1 | Production : HTTPS, HSTS, cookies sécurisés, CSP, journaux | **Fait et testé** (réglages) · **Fourni, non déployé** (serveur) | `settings.py` : redirection HTTPS, HSTS 1 an, cookies `Secure`, `X-Frame-Options`, `Referrer-Policy`, COOP, `nosniff`, CSP de l'API, limites de taille, journaux en rotation. `check --deploy` : aucune alerte. `deploy/nginx.conf` (TLS, en-têtes, CSP de l'interface, limites), `.env.production.exemple`, service systemd, `DEPLOIEMENT.md`. **Aucun HTTPS n'est actif tant que l'application n'est pas installée derrière nginx avec un certificat.** |
| S2 | Jetons non révocables | **Fait et testé** | Déconnexion qui révoque, rotation du jeton de rafraîchissement, détection de réutilisation, version de session (mot de passe, rôle, état du compte), jeton d'accès de 15 min, cookie de rafraîchissement limité à `/api/v1/auth/`. 5 tests. |
| S3 | Adresse IP falsifiable (X-Forwarded-For) | **Fait et testé** | Lue seulement derrière `TRUSTED_PROXY_COUNT` mandataires de confiance ; nginx la réécrit. 2 tests. |
| S4 | Verrouillage du compte d'autrui | **Fait et testé** | Blocage par couple compte + IP (5), compte (30), IP (20) ; « Débloquer la connexion » pour le Big Boss (bouton + API). 2 tests. |
| S5 | Pas de CSRF explicite | **Fait et testé** | Middleware CSRF sur tout `/api/`, jeton + origine ; géré par l'interface. 2 tests + navigateur. |
| S6 | `/admin/` exposée | **Fait et testé** | Route et application retirées (404). |
| S7 | Aucune contrainte CHECK | **Fait et testé** | 15 contraintes PostgreSQL (migrations testées sur une copie de la vraie base puis appliquées) ; 1 test de rejet direct en base. |
| S8 | Compteurs de débit en mémoire | **Fait (configurable)** | `CACHE_BACKEND` = `locmem` (développement), `db` ou `redis` (production, plusieurs processus). Par défaut reste `locmem` : **à régler à la mise en production**. |
| S9 | Devinette des comptes par la durée de réponse | **Fait et testé** | Faux calcul de hachage pour un identifiant inconnu ; message identique (test). |
| — | Contrôle d'accès par campement (droits des superviseurs) | **Fait et testé** | Voir 10.2. |
| — | Injection SQL | **Contrôlé et testé** | Aucune requête brute dans le code ; paramètres d'URL malveillants refusés (400) ou inertes ; tables intactes. |
| — | XSS | **Contrôlé, testé et renforcé** | Aucun `innerHTML` ; JSON seulement en entrée (415 sinon) ; CSP stricte ; reçus PDF avec HTML dans les champs. Build de production exécuté sous sa CSP : **0 violation** sur 9 écrans. |
| — | Politique de mot de passe | **Fait et testé** | 10 caractères, minuscule + majuscule + chiffre. |

### 10.2 Contrôle d'accès par campement

- Un superviseur est limité au **campement de sa fiche du personnel** (campement de son bloc d'affectation). Listes, détails, actions, tableau de bord, bilan, rapport Excel : tout est filtré côté serveur. Hors périmètre : 404 (lecture / action) ou **403 avec annulation** (écriture), y compris pour les personnes d'un travail et pour un changement d'affectation vers un autre campement.
- **Structure réservée au Big Boss :** plantations, campements, activités, catégories de dépenses (les écrans masquent les boutons pour un superviseur). `equipes`, `utilisateurs`, `journal` : Big Boss.
- **Conséquence à connaître :** un superviseur sans bloc d'affectation **ne voit rien**. Le compte de démonstration (Jean Kouassi) voit le campement Nord ; dans `allakro_db`, Jean Kouassi est affecté au Bloc A1 (Campement Nord).
- Restent communs à tous : produits de stock, vendeurs, fonctions (la décision 6.5 « stock par campement ? » est toujours ouverte).

### 10.3 Améliorations de l'audit

| Point | État |
|---|---|
| Commiter et pousser sur GitHub | **Non fait** (aucun commit sans votre demande ; le travail n'existe toujours que sur ce disque) |
| Retirer `db.sqlite3`, `accounts/backends.py`, `App.tsx` | **Fait** (supprimés ; aucune référence ; tests et build repassés) |
| Figer les versions, versionner `requirements.txt` | **Fait** (versions figées, retiré de `.gitignore`, `requests`/`pyyaml` inutilisés retirés ; `gunicorn`/`waitress` ajoutés avec marqueur de plate-forme, installation non testée ici) |
| Sauvegarde automatique | **Fait** : script + tâche planifiée quotidienne (20 h) créée sur ce poste et script testé (sauvegarde + vérification). **Copie hors machine non configurée** (`--copie`) |
| Contrôle automatique (CI) | **Fourni, non exécuté** : `.github/workflows/ci.yml` (tests sur PostgreSQL, migrations, `check --deploy`, pip-audit, ESLint, build, npm audit). Il tournera au premier envoi sur GitHub. |
| ESLint | **Fait** : `npm run lint`, 0 erreur ; détecte composants et identifiants non définis (vérifié par un faux cas) |
| Piège du focus dans les fenêtres | **Fait et testé** (navigateur : 30 Tab et 30 Maj+Tab, restitution du focus) |
| Nom du bouton de compte, ordre des titres, zone principale du login | **Fait** ; audit axe-core : **0 violation** sur 18 pages en bureau et mobile (avant : 4 types de violations, dont une « sérieuse ») |
| Effacer les erreurs d'un formulaire à la saisie | **Non fait** (demande une modification de chaque formulaire) |
| Journal : filtre par utilisateur | **Fait** (API `journal/?utilisateur_id=`) ; pas d'archivage |
| Pagination côté serveur | **Non fait** |
| Découper les gros fichiers de pages, TypeScript | **Non fait** |
| Mot de passe oublié par e-mail, notifications, ajustements de stock, clôture mensuelle, fournisseurs | **Non fait** |
| Double authentification (2FA) | **Non fait** |
| Mise à jour des outils de build vulnérables (tailwind/chokidar/braces) | **Non fait** : `npm audit fix` ne corrige que sans changement majeur (fait) ; il reste 8 avis sur des outils de développement (aucun en production : `npm audit --omit=dev` = 0) |
| Mise en ligne réelle (serveur, domaine, certificat) | **Non fait** : fichiers fournis (`deploy/`), à installer |

### 10.4 Fichiers

- **Backend :** `PRoAll/settings.py`, `PRoAll/urls.py`, `accounts/{csrf,jetons,securite,validators,authentication,limitation,permissions,audit,views,serializers,models,urls}.py`, migrations `accounts.0004`, `core.0007`, `exploitation.0006`, `finances.0009`, `stock.0003`, `achats.0004`, périmètre dans `core/views.py`, `exploitation/views.py`, `finances/views.py`, `finances/tableau_de_bord.py`, `finances/rapports/views.py`, `stock/views.py`, `achats/views.py`, `core/testing.py`, `accounts/tests_securite.py` (32 tests).
- **Frontend :** `api/client.js` (CSRF), `vite.config.js` (CSP de production), `components/ui/Modal.jsx`, `layouts/{Header,AuthLayout}.jsx`, pages de structure et `ReferentielPage.jsx` (lecture seule pour un superviseur), `UtilisateursPage.jsx`, `services/index.js`, `eslint.config.js`, `package.json`.
- **Déploiement et outils :** `deploy/` (nginx, systemd, variables, sauvegarde, guide), `.github/workflows/ci.yml`, `backend/requirements.txt`, `.gitignore`, `outils_tests/e2e_complet.mjs`.

### 10.5 Vérifications

- **115 tests backend sur 115 réussis** (83 + 32 nouveaux de sécurité) ; `makemigrations --check` : rien en attente ; `check --deploy` : aucune alerte ; `pip-audit` : aucune vulnérabilité.
- **Test de bout en bout dans le navigateur : 197 vérifications sur 197** (sur le **build de production**, à la deuxième exécution ; la première avait eu un échec isolé de temporisation sur le filtre de période de Salaires, non reproduit). Il couvre le CSRF dans le navigateur, le périmètre d'un superviseur, les cookies invisibles pour JavaScript, les en-têtes, la révocation à la déconnexion, le piège du focus.
- Contrôle du build de production sous sa CSP : 0 violation, tous les écrans et l'aperçu du reçu s'affichent.
- `verifier_coherence` : 93 contrôles sur `allakro_db`, aucune incohérence.
- **Non testé :** HTTPS et nginx réels, gunicorn / waitress, l'envoi réel de courrier, l'exécution de l'intégration continue sur GitHub, une attaque réelle (test d'intrusion externe), le comportement derrière un vrai mandataire (`TRUSTED_PROXY_COUNT=1` testé seulement par simulation d'en-têtes).

### 10.6 Effets pour vous (à savoir)

- **Tout le monde est déconnecté une fois** après la mise à jour (les anciens jetons n'ont pas la version de session) : se reconnecter suffit.
- **Mots de passe :** la nouvelle règle (10 caractères, majuscule, minuscule, chiffre) s'applique aux **nouveaux** mots de passe ; les anciens restent valables jusqu'à leur changement.
- **Superviseurs :** ils ne voient plus que leur campement ; vérifier que chacun a un bloc d'affectation (fiche Personnes).
- En développement, le serveur doit connaître l'origine de l'interface (`CSRF_TRUSTED_ORIGINS`, par défaut les origines CORS du `.env`) ; si l'interface tourne sur un autre port que 5173, l'ajouter.


---

## 11. Série « fonctions demandées » (12 octobre 2026, suite)

> Demande : cache Redis, commit et push GitHub, copie des sauvegardes hors de la machine, pagination côté serveur, découpage des gros fichiers, mot de passe oublié par e-mail, notifications, ajustements de stock, clôture mensuelle, effacement des erreurs de formulaire, avis de sécurité des outils de build, test d'intrusion. **La double authentification (2FA) est reportée à votre demande : non faite.**

### 11.1 Cache Redis

- Conteneur Docker `allakro-redis` (Redis 7, `127.0.0.1:6379`, mot de passe, `maxmemory 128mb`, redémarrage automatique avec Docker Desktop) ; réglages `CACHE_BACKEND=redis` et `CACHE_LOCATION` dans `backend/.env`. Script : `deploy/services_dev.ps1`.
- Il sert aux **compteurs de limitation de débit** (connexion, réinitialisation, etc.), désormais partagés entre processus et conservés au redémarrage. Clés vérifiées dans Redis (`allakro:1:throttle_connexion_<ip>`).
- **Redis en panne = l'application continue** : `apps/core/cache.py` (`CacheRedisTolerant`) intercepte les erreurs, coupe les appels 30 s (disjoncteur) et journalise dans `allakro.securite` au plus une fois par minute ; les limites sont alors suspendues, le blocage de connexion en base reste actif. Testé (2 tests).
- Les tests automatisés utilisent un cache mémoire (sauf `TEST_AVEC_REDIS=1`).
- **À faire par vous :** Docker Desktop doit être démarré ; **redémarrez votre serveur Django (port 8000)** pour qu'il lise les nouveaux réglages `.env` (Redis et courrier).

### 11.2 Mot de passe oublié par e-mail

- Pages `/mot-de-passe-oublie` et `/reinitialiser-mot-de-passe?jeton=…` ; lien « Mot de passe oublié ? » sur la connexion.
- Sécurité : jeton aléatoire, **seul son hachage sha256 est stocké**, valable 30 minutes, **à usage unique**, 3 demandes par heure et par compte au plus, les jetons précédents sont invalidés, **même réponse que le compte existe ou non** (pas d'énumération), limites de débit dédiées (5 et 10 par heure et par adresse IP), envoi dans un fil séparé (pas de différence de temps mesurable). Une réinitialisation déconnecte toutes les sessions du compte.
- Courrier : Mailpit en développement (SMTP `127.0.0.1:1025`, boîte de réception http://localhost:8025) ; en production un vrai serveur SMTP (`EMAIL_*`). **L'envoi vers une vraie boîte aux lettres n'a pas été vérifié** : seul Mailpit a reçu des messages.
- Modèle `ReinitialisationMotDePasse` (migration `accounts.0005`).

### 11.3 Notifications

- Cloche dans l'en-tête (interrogation toutes les 60 s) : lire une notification ou tout marquer comme lu.
- Déclencheurs : produit passé **sous son seuil** (au franchissement seulement), annulation d'un paiement ou d'un travail (au Big Boss, sans notifier l'auteur), compte bloqué après trop d'échecs, clôture ou réouverture d'un mois, rappel quotidien des rémunérations à payer (Big Boss).
- API : `GET /notifications/`, `POST /notifications/<id>/lire/`, `POST /notifications/lire-tout/` ; modèle `Notification` (migration `accounts.0005`), clé unique pour ne pas répéter une alerte.

### 11.4 Ajustements de stock (inventaire)

- Nouveau type de mouvement « Ajustement (inventaire) » : on saisit le **stock constaté**, la quantité du mouvement est calculée (constaté − enregistré, signée) ; la liste affiche le signe et un badge.

### 11.5 Clôture mensuelle

- Big Boss : « Clôturer le mois » (page Bilan) enregistre un **instantané des chiffres du mois** ; ensuite le mois est **verrouillé** : travaux, dépenses, achats et règlements, mouvements de stock, rémunérations et paiements de ce mois ne peuvent plus être créés, modifiés, annulés ni supprimés (message explicite). Un paiement est aussi refusé si le salaire ou l'achat concerné appartient à un mois clos.
- **Réouverture** par le Big Boss (journalisée, notification). API : `GET/POST /clotures/`, `POST /clotures/<période>/rouvrir/` ; modèle `ClotureMensuelle` (migration `finances.0010`).
- `manage.py verifier_coherence` compare maintenant l'instantané de chaque mois clos aux chiffres recalculés.

### 11.6 Pagination côté serveur

- L'API renvoie la liste complète comme avant, **sauf si `?page=` est fourni** : `{count, page, page_size, pages, results}` (taille maximale 200). Paramètres : `q` (recherche sans accent ni casse, extension PostgreSQL `unaccent`, migration `core.0008`), `ordering`, filtres propres à chaque liste (statut, à payer, fonction…), et `…/totaux/` pour les indicateurs calculés sur **tout** le résultat filtré (pas seulement la page).
- Passées en pagination serveur : Dépenses, Travaux, Rémunérations, Paiements, Achats aux particuliers, Personnes, Mouvements de stock, Journal. Interface : hook `useListeServeur` (délai de 300 ms sur la recherche, protection contre les réponses tardives) et `DataTable` en mode serveur.
- **Effet à connaître :** les tris par colonne se font côté serveur, sur les colonnes déclarées par chaque liste.

### 11.7 Effacement des erreurs de formulaire

- L'erreur d'un champ disparaît dès qu'on modifie ce champ (hook `useErreurVisible`, branché dans `Input`, `Select`, `Autocomplete`, `MultiSelect`).

### 11.8 Découpage des gros fichiers

- `TravauxPage`, `SalairesPage`, `ParticuliersPage`, `StockPage`, `DepensesPage`, `UtilisateursPage` : colonnes, formulaires et fenêtres déplacés dans des fichiers dédiés (`pages/travaux/`, `pages/salaires/`, `pages/particuliers/`, `pages/stock/`, `pages/depenses/`, `components/SuiviUtilisateur.jsx`). Comportement inchangé (E2E identique). **TypeScript : non fait.**
- ESLint (`npm run lint`) remplace `verif_imports.py` (supprimé) : 0 problème.

### 11.9 Copie des sauvegardes hors de la machine

- `deploy/sauvegarde_postgres.py --chiffrer --copie <dossier>` : copie **chiffrée** (Fernet par blocs, clé `SAUVEGARDE_CLE` créée dans `backend/.env`), **relue et vérifiée** après écriture, rotation (`--garder`). Déchiffrement : `deploy/dechiffrer_sauvegarde.py`. Aller-retour testé (une mauvaise clé est refusée).
- Tâche planifiée Windows « ALLAKRO sauvegarde PostgreSQL » (tous les jours à 20 h) réenregistrée avec `--chiffrer --copie` et **exécutée une fois avec succès** (code 0, deux fichiers chiffrés).
- Destination : `C:\Users\HP\OneDrive\Sauvegardes ALLAKRO`. **Je ne peux pas vérifier que OneDrive envoie bien les fichiers dans le cloud** ; vérifiez l'icône OneDrive. **Conservez `SAUVEGARDE_CLE` ailleurs** (gestionnaire de mots de passe) : sans elle les copies sont illisibles. Dépendance ajoutée : `cryptography`.

### 11.10 Test d'intrusion

- **Ce que j'ai fait :** `outils_tests/pentest.py`, test **automatisé interne** contre une instance en mode production : **77 contrôles repoussés** (accès sans jeton, rôles, périmètre par campement, injections SQL, XSS, CSRF, JWT falsifiés, limites de débit, énumération de comptes, chemins, en-têtes, entrées malformées). **Une vraie faille trouvée et corrigée :** un caractère NUL dans l'adresse provoquait une erreur 500 (filtre `EntreesSainesMiddleware`, test ajouté).
- **Ce que je n'ai pas fait et ne peux pas faire :** un **test d'intrusion externe indépendant**. Un test réalisé par moi, sur ma machine, avec mes outils ne remplace pas un audit par un tiers sur le serveur réellement exposé ; à commander avant une vraie mise en production.

### 11.11 Avis de sécurité des outils de build

- Avant : 8 avis `npm audit` sur la chaîne de développement de Tailwind 3 (aucun en production : `npm audit --omit=dev` = 0).
- **Fait sur une branche à part, `tailwind4` (non fusionnée dans `main`)** : migration vers Tailwind CSS 4 avec l'outil officiel de mise à jour. `npm audit` : **0 vulnérabilité** (sur `main`, avec Tailwind 3 : les 8 avis restent, tous sur des outils de développement).
- **Vérifié sur cette branche :** ESLint 0 problème ; build ; **test de bout en bout 197 vérifications sur 197** (sur le build) ; **axe : 0 violation** sur la connexion et 17 pages (script d audit en bureau et mobile) ; pas de débordement horizontal (contrôlé par le test).
- **Ce que la migration a cassé et que j'ai dû corriger :** (1) le **thème sombre** : avec Tailwind 3, les composants `@apply bg-white` (`.card`, `.input-base`…) recopiaient les surcharges sombres ; avec Tailwind 4 ce n'est plus vrai, les cartes restaient blanches avec du texte clair. J'ai ajouté les règles sombres explicites ; (2) un décalage de 6 px du séparateur de la barre latérale (marge redondante). Le test de bout en bout a aussi dû être adapté (une classe `z-[100]` devenue `z-100`).
- **Réserve honnête :** la comparaison de captures avec Tailwind 3 n'est pas parfaitement comparable (la base de démonstration n'était pas dans le même état) ; j'ai relu les images, la mise en page est la même, mais **je ne peux pas garantir l'absence de petits décalages de 1 à 2 px ailleurs** (Tailwind 4 change quelques valeurs par défaut : bordures, ombres, anneaux). Les pages que je n'ai pas vues à l'œil (fenêtres peu fréquentes, états d'erreur) sont à regarder avant de fusionner.
- **Pour l'adopter :** `git merge tailwind4` puis, dans `frontend`, `npm install` ; **arrêter puis relancer votre serveur de l'interface (5173)** (le serveur actuel utilise les dépendances de Tailwind 3). Pour revenir en arrière : ne pas fusionner, ou `git revert`.

### 11.12 Ce qui n'est PAS fait ou PAS vérifié

| Sujet | État |
|---|---|
| Double authentification (2FA) | **Non fait** (reporté à votre demande) |
| Test d'intrusion externe | **Non fait** : seul un test interne automatisé a été réalisé (11.10) |
| Envoi réel de courrier (SMTP d'un hébergeur) | **Non vérifié** : seul Mailpit local a reçu des messages |
| Synchronisation OneDrive vers le cloud | **Non vérifiable** depuis l'application |
| Intégration continue GitHub (`.github/workflows/ci.yml`) | **Jamais exécutée** |
| Mise en ligne (HTTPS, nginx, gunicorn, domaine) | **Non faite** : fichiers fournis dans `deploy/` |
| TypeScript | **Non fait** |
| Tailwind 4 (0 avis npm) | **Prêt sur la branche `tailwind4`, non fusionné** : à décider (11.11) |

### 11.13 Fichiers

- **Backend :** `core/cache.py`, `core/middleware.py`, `core/tests_cache.py`, `accounts/{reinitialisation,notifications}.py`, `accounts/{models,views,serializers,urls,audit}.py`, `finances/{clotures,paiements,tableau_de_bord,views,urls}.py`, `exploitation/views.py`, `achats/{views,serializers}.py`, `stock/{views,serializers}.py`, `core/views.py`, `core/management/commands/verifier_coherence.py`, migrations `accounts.0005`, `finances.0010`, `core.0008`, `PRoAll/settings.py`, tests `accounts/tests_fonctions.py` (15), `accounts/tests_pagination.py` (12).
- **Frontend :** `hooks/{useListeServeur,useErreurVisible}.js`, `components/ui/{DataTable,Input,Select,Autocomplete,MultiSelect}.jsx`, `components/layouts/NotificationsMenu.jsx`, `components/ClotureMois.jsx`, `pages/{MotDePasseOubliePage,ReinitialiserMotDePassePage}.jsx`, pages découpées (11.8), `services/index.js`, `api/auth.js`.
- **Déploiement et outils :** `deploy/{sauvegarde_postgres,dechiffrer_sauvegarde}.py`, `deploy/services_dev.ps1`, `deploy/DEPLOIEMENT.md`, `deploy/.env.production.exemple`, `outils_tests/{pentest.py,captures_comparaison.mjs,comparer_captures.py,lancer_serveurs_test.ps1,arreter_serveurs_test.ps1}`.

### 11.14 Vérifications

- **145 tests backend sur 145 réussis** (115 + 15 réinitialisation, notifications et clôture + 12 pagination + 2 cache + 1 filtre des entrées) ; `check` et `makemigrations --check` : rien à signaler ; ESLint : 0 problème.
- Test de bout en bout navigateur : **197 vérifications sur 197** avec la pagination serveur (après attente du délai de recherche dans le script).
- Migrations `accounts.0005`, `core.0008`, `finances.0010` appliquées sur `allakro_db` **après sauvegarde** (`alakro_sauvegardes/avant_migrations`) ; `verifier_coherence` : 93 contrôles, aucune incohérence.

---

## 12. Responsables de campements, mot de passe visible, droits du superviseur (13 octobre 2026)

### 12.1 Responsable d'un campement = un utilisateur
- Le formulaire de campement ne propose que les **utilisateurs superviseurs actifs** (comptes créés par le Big Boss ; seul lui peut créer un compte). Route `GET /campements/responsables/` (Big Boss). Le Big Boss lui-même et les personnes sans compte ne sont plus proposés.
- **L'API le refuse aussi** (400) : une personne sans compte, un compte désactivé ou le Big Boss ne peut pas être choisi comme responsable. La règle ne s'applique qu'au **changement** de responsable : un campement existant dont le responsable n'a pas de compte reste affiché (« sans compte utilisateur ») et modifiable sans perdre ce responsable.
- Les données de démonstration (`seed_allakro`) et `reinitialiser_base` écrivent leurs responsables directement en base (sans cette règle).

### 12.2 Un responsable gère plusieurs campements
- Le modèle le permettait déjà (un responsable peut figurer sur plusieurs campements) ; **le périmètre du superviseur le reflète maintenant** : son campement d'affectation **plus** tous les campements actifs dont il est responsable. Listes, détails, écritures, tableau de bord et rapports s'appliquent à l'ensemble ; il peut choisir l'un de **ses** campements dans les filtres (un autre campement : 403).
- **Réserve :** le tableau de bord et les rapports calculent pour **un seul campement à la fois** ; sans choix, c'est le premier (celui de son bloc). Un total « tous mes campements » n'existe pas (non fait).

### 12.3 Voir le mot de passe à la saisie
- Tous les champs « mot de passe » (création de compte, changement de mot de passe, réinitialisation) ont un bouton œil (afficher / masquer). Les indications disaient « 8 caractères » alors que la règle réelle est **10 caractères avec majuscule, minuscule et chiffre** : corrigé.

### 12.4 Droits du superviseur (vérification)
- Réservé au Big Boss, **testé** (le superviseur reçoit 403) : créer / modifier / supprimer plantations, campements et **blocs** ; activités et catégories de dépenses ; gérer les comptes, débloquer un compte ; journal ; clôturer / rouvrir un mois ; **toute suppression**.
- **Corrigé dans cette série :** les **blocs** pouvaient encore être créés et modifiés par un superviseur (API et bouton visibles) : désormais Big Boss seulement.
- **Reste permis au superviseur (choix à confirmer) :** saisir et modifier travaux, rémunérations manuelles, paiements, dépenses, personnes, produits et mouvements de stock, achats aux particuliers ; annuler / réactiver un paiement et annuler / rétablir un travail (décision du 11 octobre). Dites-moi si l'un de ces droits doit passer au Big Boss seul.

### 12.5 Vérifications
- Tests : **148 sur 148** (3 nouveaux : responsables proposés, responsable de plusieurs campements, liste exhaustive de 21 actions refusées au superviseur).
- Navigateur (`outils_tests/verif_roles.mjs`, 10 vérifications) : liste des responsables, bouton œil, absence des boutons de structure pour le superviseur.

---

## 13. Préparation du déploiement gratuit sur Render + Neon (14 octobre 2026)

> Décisions de l'utilisateur : hébergement **gratuit** pour un test client à distance ; **base vide** (aucune donnée actuelle envoyée) ; **mot de passe oublié contourné** (le Big Boss réinitialise à la main) ; **un compte Big Boss séparé pour le client**.

### 13.1 Ce qui a été ajouté
- **`render.yaml`** (racine) : API Django (gunicorn, un processus, région Frankfurt) et interface (site statique) avec redirection `/api/*` vers l'API (même adresse pour l'interface et l'API : les cookies de session et le CSRF fonctionnent sans réglage croisé), en-têtes de sécurité, clés secrètes générées par Render.
- **`DATABASE_URL`** : lue en priorité si elle existe (`apps/core/config_db.py`) ; sinon les variables `DB_*` comme avant (le développement ne change pas). Gère les caractères spéciaux du mot de passe, `sslmode`, et le répartiteur de connexions de Neon (`-pooler`).
- **`manage.py initialiser_production`** : à chaque démarrage, crée les rôles (Big Boss, Superviseur) et jusqu'à **deux comptes Big Boss** à partir de variables d'environnement (`BIG_BOSS_1_*`, `BIG_BOSS_2_*`) ; **ne modifie jamais un compte existant**, n'affiche jamais un mot de passe, refuse un mot de passe qui ne respecte pas la règle. Indispensable car l'offre gratuite de Render n'a pas de terminal.
- **Lien « Mot de passe oublié ? »** remplacé par « Contactez votre administrateur » quand l'interface est construite avec `VITE_MOT_DE_PASSE_OUBLIE=false` (c'est le cas dans `render.yaml`). Sans cette variable, le comportement est inchangé.
- `RENDER_EXTERNAL_HOSTNAME` (fourni par Render) est ajouté automatiquement aux hôtes autorisés.
- **Guide pas à pas :** `deploy/RENDER.md` (Neon, Render, comptes, réveil de l'API, dépannage, limites).
- **Outil de simulation :** `outils_tests/simuler_render.py` (base vide, `DATABASE_URL`, migrations, deux démarrages, `check --deploy`, connexion des deux comptes, sonde de santé).

### 13.2 Vérifié
- Tests : **155 sur 155** (7 nouveaux : lecture de `DATABASE_URL`, premier démarrage, idempotence, mot de passe refusé, rôles sans variables).
- Simulation locale du démarrage Render : **13 vérifications sur 13**, `check --deploy` sans alerte avec les réglages de production ; `allakro_db` non touchée (`verifier_coherence` : 93 contrôles, aucune incohérence).

### 13.2 bis Premier déploiement réel (14 octobre 2026) : ce qui s'est passé
- **`render.yaml` refusé une première fois** : un site statique n'accepte pas de ligne `region` (retirée).
- **API en ligne sur Render** : migrations appliquées sur Neon, deux comptes Big Boss créés, sonde de santé 200 (journaux fournis par l'utilisateur).
- **Défaut trouvé à l'usage et corrigé :** la page **Campements** ne s'affichait pas pour un **superviseur** : elle appelait la liste des responsables (réservée au Big Boss), reçait un 403 et tombait en erreur. Introduit par la série du 13 octobre ; mon test navigateur vérifiait l'absence du bouton « Nouveau campement » mais **pas que la liste s'affichait**. Corrigé (la liste n'est demandée qu'au Big Boss) et le test vérifie désormais l'affichage des listes ; **balayage de toutes les pages avec les deux rôles** (`balayage_pages.mjs`) : aucun refus inattendu.
- **Garde de route :** un superviseur qui tape l'adresse d'Utilisateurs ou du Journal est renvoyé au tableau de bord (au lieu d'une page d'erreur).

### 13.3 NON vérifié (à ne pas annoncer comme fait)
- **Aucun déploiement réel n'a été fait** : ni Render ni Neon n'ont été utilisés. Je n'ai pas accès à leurs tableaux de bord.
- La **version de Python (3.14.3) sur Render** n'est pas confirmée ; repli prévu en 3.13.
- La **redirection `/api/*` du site statique** (cookies, en-tête `Host`, `Origin`) n'est pas testée sur Render ; son comportement réel peut obliger à un ajustement.
- **L'adresse IP vue par l'API** derrière Render : `TRUSTED_PROXY_COUNT` reste à 0 ; les limites par adresse IP s'appliqueront peut-être à tous les visiteurs ensemble.
- L'envoi de courrier n'est pas configuré (choix). Aucune sauvegarde automatique ; test d'intrusion externe non fait.


---

## 14. Page « Exploitation », responsables de campements et ouvriers au niveau du campement (15 octobre 2026, branche `exploitation`)

> Série demandée après la mise en test chez le client : la création plantation → campement → bloc → utilisateur demandait cinq écrans dans un ordre à connaître. **Travail fait sur la branche `exploitation`, non fusionnée dans `main` au moment de cette rédaction** (voir 14.8).

### 14.1 Règles décidées par l'utilisateur
- **Un campement a toujours un responsable** (jamais sans). Le responsable est un utilisateur : **superviseur ou Big Boss** (le Big Boss peut désormais l'être).
- **Un responsable gère tous les blocs de ses campements et peut gérer plusieurs campements.** Il n'est plus rattaché à un bloc.
- **Les ouvriers sont enregistrés au niveau du campement** (ils travaillent sur tous les blocs de ce campement), par les responsables.
- **Un responsable crée et modifie les blocs de ses campements** ; la suppression d'un bloc, comme toute suppression, reste au Big Boss.
- **Vue globale « tous mes campements »** pour un responsable de plusieurs campements (par défaut), ou un campement choisi, ou une période.
- **Déconnexion avec confirmation.**

### 14.2 Backend
- `Campement.responsable` devient **obligatoire** (PROTECT). Migration `core.0009` : tout campement sans responsable valide (vide, ou personne sans compte actif de superviseur / Big Boss) **reçoit le premier Big Boss actif** ; l'ancien nom (sans compte) est conservé dans la description du campement. La migration échoue avec un message clair s'il n'existe aucun Big Boss actif.
- `Utilisateur.campements_autorises()` : pour un superviseur = **les campements dont il est responsable** (plus de périmètre par bloc d'affectation).
- Création / modification de campement : responsable obligatoire (400 sinon), compte actif de superviseur ou Big Boss exigé ; `GET /campements/responsables/` (Big Boss) liste les responsables possibles avec les campements qu'ils gèrent.
- **Désactivation protégée** : un compte ou une personne responsable d'un campement ne peut pas être désactivé tant qu'il gère un campement (« désignez d'abord un autre responsable »).
- **Personnes** : `campement_id` obligatoire à la saisie ; `bloc_id` reste accepté (anciennes données ; le campement est alors celui du bloc). La fiche d'un responsable sans campement est rattachée au premier campement qu'on lui confie.
- **Comptes** : la création d'un compte ne demande plus de bloc ; `campements_ids` (facultatif) confie des campements (ils changent de responsable) ; sur un compte existant, `campements_ids` **ajoute** des campements (on ne retire jamais : on désigne un autre responsable). La représentation d'un compte contient `campements` (ceux qu'il gère).
- **Blocs** : création et modification autorisées au responsable dans son périmètre (contrôle serveur) ; suppression Big Boss seulement.
- **Chiffres** : `forcer_perimetre` renvoie, sans choix, **tous les campements du responsable** (liste) ; tableau de bord, bilan, rapports Excel (`mes-campements` dans le nom du fichier) et totaux des listes les acceptent ; un campement choisi qui n'est pas le sien reste refusé (403).
- Jeux de données (`seed_allakro`, `reinitialiser_base`) adaptés : campements créés avec le Big Boss comme responsable, Jean Kouassi responsable de « Campement Nord » sans bloc.

### 14.3 Interface
- **Un seul menu « Exploitation »** → page à onglets : **Vue d'ensemble** (arbre plantation → campements → blocs, avec création sur place : « + Campement » sur une plantation, « + Bloc » sur un campement, « + Nouvelle plantation »), **Plantations**, **Campements**, **Blocs** (les listes habituelles). Les anciennes adresses (`/plantations`, `/campements`, `/blocs`) renvoient vers l'onglet correspondant.
- **Nouvelles fiches** : plantation (ses campements et responsables) et campement (responsable, blocs, personnes, informations) ; la fiche d'un bloc existait déjà. La recherche de l'en-tête et les listes y mènent.
- **Formulaire de campement** : responsable obligatoire, rôle affiché, et **« + Nouveau responsable »** (crée un compte superviseur sans quitter le formulaire).
- **Fenêtres de saisie réutilisables** (plantation, campement, bloc) partagées par les listes, l'arbre et les fiches.
- **Formulaire de personne** : campement (plus de bloc) ; **formulaire de compte** : campements à gérer (facultatif) ; colonne « Campements gérés » sur la page Utilisateurs ; messages de mot de passe alignés sur la vraie règle (10 caractères).
- **Travaux** : les personnes du campement du bloc choisi sont proposées en premier.
- **Déconnexion** : fenêtre « Se déconnecter ? » (Annuler / Se déconnecter).
- Un seul bouton « voir le mot de passe » dans Edge (le bouton natif du navigateur est masqué).
- Une action refusée depuis un menu (ex. désactivation) affiche **son motif** au lieu de « Vérifiez les champs signalés ».

### 14.4 Vérifications
- Tests backend : voir 14.7. Navigateur : `outils_tests/verif_exploitation.mjs` (**27 vérifications** : menu, arbre, création plantation → campement avec nouveau responsable → bloc, fiches, anciennes adresses, déconnexion avec confirmation, vue du responsable créé, vue de Jean) ; test de bout en bout **202 vérifications sur 202** (adapté : personnes au campement, superviseurs sans bloc, désactivation refusée puis permise) ; balayage de toutes les pages avec les deux rôles : aucun refus inattendu ; pas de débordement à 390 px sur les nouvelles pages.

### 14.5 À savoir (limites et choix)
- **Le champ `bloc` des personnes existe toujours** (anciennes données) : les personnes déjà rattachées à un bloc le gardent ; modifier une telle personne dans l'interface la rattache au campement seul.
- **Aucune restriction serveur** n'empêche un Big Boss d'affecter à un travail une personne d'un autre campement que celui du bloc ; l'interface propose seulement celles du campement en premier.
- Un compte superviseur **sans campement** est possible (écran vide, mention « Aucun pour le moment ») ; un campement confié à un autre responsable change de responsable immédiatement.
- **Non fait** : l'assistant de première installation (étape optionnelle, jugée inutile tant que la page Exploitation suffit) ; mots de passe oubliés par e-mail (contournés pour le test Render).

### 14.6 Effet sur la base du client (Render)
- La migration `core.0009` s'exécutera **au prochain démarrage de l'API après fusion** : si le client a créé des campements sans responsable valide, ils recevront le **premier compte Big Boss actif (le vôtre, `BIG_BOSS_1`)**, à réassigner depuis l'onglet Campements. Les superviseurs que le client a pu créer **avec un bloc** n'auront plus de campement tant qu'on ne leur en confie pas (ou qu'ils ne sont pas désignés responsables).
