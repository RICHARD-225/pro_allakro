# Déployer ALLAKRO gratuitement : Render (interface + API) et Neon (PostgreSQL)

> **But :** permettre à un client de tester l'application à distance, à zéro franc. **Ce n'est pas une mise en production** : voir « Limites » en bas.
> **État :** la configuration (`render.yaml`, démarrage automatique, accès à la base par adresse unique) a été **vérifiée en local** (`outils_tests/simuler_render.py` : base vide, migrations, comptes, connexion, sonde de santé, `check --deploy` sans alerte). **Rien n'a encore été testé sur Render ni sur Neon** : le premier déploiement peut demander un ou deux ajustements (voir « Si ça ne marche pas »).

## Ce que vous devez préparer avant
- Un compte **Render** et un compte **Neon** (connexion par GitHub possible, c'est suffisant).
- **Deux comptes Big Boss à créer** : le vôtre (propriétaire) et celui du client. Choisissez pour chacun une adresse e-mail et un **mot de passe de 10 caractères au moins avec une majuscule, une minuscule et un chiffre**. Ne les écrivez jamais dans GitHub : ils se saisissent dans Render.

## Étape 1 — La base chez Neon (5 minutes)
1. Sur https://console.neon.tech : **Create project**.
2. Nom : `allakro`. **Région : AWS Europe (Frankfurt)** (la plus proche de Render Frankfurt). Version de PostgreSQL : la plus récente proposée.
3. Une fois créé, cliquez sur **Connect** et copiez la **Connection string** (elle ressemble à `postgresql://utilisateur:mot_de_passe@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`). Que l'option « pooled » soit cochée ou non, les deux fonctionnent.
4. Gardez cette adresse : c'est un **secret** (elle contient le mot de passe de la base).

## Étape 2 — Vérifier les noms dans `render.yaml`
Le fichier `render.yaml` (à la racine du dépôt) nomme les services `allakro-richard225-api` et `allakro-richard225-web`. Leurs adresses seront `https://allakro-richard225-api.onrender.com` et `https://allakro-richard225-web.onrender.com`.
**Si un nom est déjà pris**, Render ajoute un suffixe : modifiez alors les noms dans le fichier et **les 4 endroits qui répètent l'adresse** (`ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`) ainsi que la `destination` de la redirection `/api/*`. Dites-le-moi et je le fais pour vous.

## Étape 3 — Créer les services sur Render (10 minutes)
1. https://dashboard.render.com : **New +** puis **Blueprint**.
2. **Connect a repository** : choisissez **RICHARD-225/pro_allakro** (donnez à Render l'accès à **ce dépôt seulement**). Branche `main`.
3. Render lit `render.yaml` et vous demande les variables « secrètes » :
   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | l'adresse copiée chez Neon (étape 1) |
   | `BIG_BOSS_1_EMAIL` / `_MOT_DE_PASSE` / `_PRENOM` / `_NOM` | votre compte propriétaire |
   | `BIG_BOSS_2_EMAIL` / `_MOT_DE_PASSE` / `_PRENOM` / `_NOM` | le compte du client |
4. **Apply**. Render construit l'interface et l'API (comptez 5 à 10 minutes la première fois). Au démarrage de l'API, les tables sont créées et vos deux comptes aussi (sans danger si l'API redémarre : un compte existant n'est jamais modifié).
5. Quand les deux services sont « Live », ouvrez l'adresse de l'**interface** (`…-web.onrender.com`) et connectez-vous avec un des comptes.

## Étape 4 — Garder le site réveillé (facultatif, gratuit)
L'API gratuite **s'endort après environ 15 minutes sans visite** : la première page met alors 30 à 60 secondes. Pour l'éviter pendant le test, créez un moniteur gratuit sur https://uptimerobot.com : type HTTP(s), adresse `https://allakro-richard225-api.onrender.com/api/v1/sante/`, intervalle 5 minutes.

## Donner l'accès au client
- Envoyez-lui l'adresse de l'**interface**, son e-mail et son mot de passe **par un canal séparé** (pas dans le même message). Demandez-lui de **changer son mot de passe** dès la première connexion (Paramètres).
- La base est **vide** : le client crée lui-même plantation, campements, blocs, personnel, etc. (ordre : plantation, campement, bloc, personnes, puis travaux).
- **Mot de passe oublié :** pas de courrier sur ce test. Le lien de la page de connexion est remplacé par « Contactez votre administrateur ». Vous (Big Boss) redonnez un mot de passe depuis **Administration > Utilisateurs > modifier**.

## Si ça ne marche pas
| Symptôme | Cause probable | Que faire |
|---|---|---|
| Build de l'API échoue sur la version de Python | `PYTHON_VERSION` 3.14.3 pas encore disponible chez Render | Dans `render.yaml`, mettre `3.13.5` (je dois alors tester en 3.13) |
| « Bad Request (400) » ou « DisallowedHost » | nom d'hôte de l'API différent de celui du fichier | Corriger `ALLOWED_HOSTS` (étape 2) |
| La connexion répond « 403 » / CSRF | `CORS_ALLOWED_ORIGINS` ou `CSRF_TRUSTED_ORIGINS` ne correspond pas à l'adresse de l'interface | Corriger ces deux variables dans Render (Environment) puis redéployer l'API |
| La connexion semble réussir puis on est renvoyé à l'écran de connexion | cookies refusés (interface et API sur deux adresses) : la redirection `/api/*` du site statique ne fonctionne pas comme prévu | Me transmettre le message ; solution de repli : un domaine commun |
| « Erreur de base de données » | `DATABASE_URL` mal copiée | La recoller depuis Neon (sans espace) |
| Trop de « 429 » avec plusieurs utilisateurs | le serveur voit une seule adresse IP (celle de Render) pour tout le monde | Ajuster `TRUSTED_PROXY_COUNT` après vérification des en-têtes (à me signaler) |

## Limites de cette formule gratuite
- **Réveil lent** après inactivité (étape 4 pour l'atténuer). Offres gratuites susceptibles de changer.
- **Neon gratuit :** environ 0,5 Go de stockage, restauration limitée dans le temps. **Aucune sauvegarde automatique fiable** : avant une session importante, exportez la base (`pg_dump "<adresse Neon>" -Fc -f sauvegarde.dump`).
- **Journaux sur disque** perdus à chaque redémarrage de l'API (les journaux restent visibles dans l'onglet Logs de Render).
- **Pas de Redis** (cache en mémoire, un seul processus) : suffisant pour ce test.
- **Pas de test d'intrusion externe** ; ne mettez pas de données réelles sensibles tant que ce n'est pas fait.
- Le dépôt GitHub étant public, **ne mettez aucun secret dans les fichiers du dépôt** (uniquement dans les variables de Render).
