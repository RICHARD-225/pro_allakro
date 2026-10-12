# Mise en production d'ALLAKRO

> **État :** les fichiers de ce dossier sont fournis et leur contenu a été contrôlé (`manage.py check --deploy` sans alerte avec les réglages de production, build de production testé sous sa politique CSP). **Aucun déploiement n'a encore été fait sur un serveur** : nginx, TLS, gunicorn, le service systemd et le test de bout en bout sur le vrai domaine restent à réaliser et à vérifier chez l'hébergeur.

## 1. Ce qu'il faut

| Élément | Choix conseillé |
|---|---|
| Serveur | Linux (Ubuntu LTS) avec nginx, PostgreSQL, Python 3.14 ; Windows possible (waitress à la place de gunicorn, nginx pour Windows ou IIS) |
| Nom de domaine | `allakro.exemple.com` (à remplacer partout) |
| Redis | Version 7+, protégé par mot de passe, écoutant sur `127.0.0.1` seulement (compteurs de limitation de débit partagés entre les processus). Sans Redis l'application continue de fonctionner (limites suspendues, blocage de connexion en base toujours actif) |
| Courrier | Un serveur SMTP réel (hébergeur, Brevo, Mailjet, Gmail avec « mot de passe d'application »…) pour « mot de passe oublié » |
| Certificat HTTPS | Let's Encrypt : `certbot --nginx -d allakro.exemple.com` |
| Pare-feu | Ports 80 et 443 ouverts ; **5432 (PostgreSQL) et 8000 (gunicorn) fermés** à l'extérieur |

## 2. Étapes

1. **Code :** copier le projet dans `/opt/allakro`, créer l'environnement : `python -m venv env && env/bin/pip install -r backend/requirements.txt`.
2. **Configuration :** copier `deploy/.env.production.exemple` vers `backend/.env` ; générer **deux clés différentes** (`SECRET_KEY`, `JWT_SIGNING_KEY`) ; `chmod 600 backend/.env`. `DEBUG=False` est obligatoire.
3. **Redis et courrier :** renseigner `CACHE_BACKEND=redis`, `CACHE_LOCATION` et les variables `EMAIL_*` dans `backend/.env` (voir `.env.production.exemple`) ; en développement, `deploy/services_dev.ps1` lance Redis et Mailpit (boîte de réception de test, http://localhost:8025) dans Docker. **L'envoi vers une vraie boîte aux lettres n'a pas été vérifié** : à tester sur le serveur (demander une réinitialisation vers une adresse réelle).
4. **Base :** créer un compte PostgreSQL dédié aux droits limités à `allakro_db` ; `python manage.py migrate` ; si `CACHE_BACKEND=db` : `python manage.py createcachetable`.
5. **Premier compte Big Boss :** créer le rôle et le compte (shell Django ou commande dédiée) ; **ne jamais lancer `seed_allakro` ni `reinitialiser_base` en production** (comptes de démonstration, suppression des données).
6. **Interface :** `cd frontend && npm ci --legacy-peer-deps && npm run build` ; copier `dist/` dans `/var/www/allakro/dist`.
7. **API :** copier `deploy/allakro-api.service` dans `/etc/systemd/system/`, adapter les chemins, `systemctl enable --now allakro-api`.
8. **nginx :** copier `deploy/nginx.conf` dans `sites-available`, adapter domaine et certificats, `nginx -t && systemctl reload nginx`.
9. **Contrôles :** `python manage.py check --deploy` (aucune alerte attendue), ouvrir `https://allakro.exemple.com`, se connecter, vérifier avec https://securityheaders.com et https://www.ssllabs.com/ssltest/ (objectif A ou A+).

## 3. Sauvegardes

- **Quotidienne :** `python deploy/sauvegarde_postgres.py /var/backups/allakro --garder 14 --copie <autre disque ou stockage distant> --verifier` (cron : `0 20 * * *`). Sous Windows, une tâche planifiée « ALLAKRO sauvegarde PostgreSQL » (tous les jours à 20 h, dossier `alakro_sauvegardes\auto`) a été créée sur ce poste de développement.
- **Copie hors machine :** indispensable (la sauvegarde sur le même disque ne protège pas d'une panne du disque). Utiliser `--copie` vers un autre support ou un stockage distant, avec `--chiffrer` : la copie est chiffrée (Fernet, clé `SAUVEGARDE_CLE` créée dans `backend/.env` au premier usage), relue et vérifiée après écriture. **Conserver cette clé ailleurs** (gestionnaire de mots de passe) : sans elle les copies sont illisibles. Déchiffrement : `python deploy/dechiffrer_sauvegarde.py <fichier.dump.chiffre> <sortie.dump>`. Sur ce poste de développement, la copie va dans `C:\Users\HP\OneDrive\Sauvegardes ALLAKRO` ; la synchronisation vers le cloud par OneDrive n'est pas vérifiable depuis l'application.
- **Clôture mensuelle :** après clôture d'un mois, ses écritures sont bloquées (réouverture possible par le Big Boss) ; `manage.py verifier_coherence` compare les chiffres figés aux chiffres recalculés.
- **Test de restauration** à faire régulièrement : `outils_tests/pg_outils.py copier <fichier.dump> <base de vérification>` puis `manage.py verifier_coherence` sur cette base.

## 4. Journaux et surveillance

- Événements de sécurité (connexions, échecs, blocages, accès refusés, requêtes CSRF refusées) : `backend/logs/securite.log` ; erreurs serveur : `backend/logs/erreurs.log` (rotation 5 Mo × 10).
- Sonde de disponibilité pour la supervision : `GET /api/v1/sante/` (200 et `{"ok": true}` si la base répond).
- Surveiller les 429 répétés et les « Jeton de rafraîchissement réutilisé » (copie de session possible).

## 5. Mises à jour

1. Sauvegarde, 2. `git pull`, 3. `pip install -r backend/requirements.txt`, 4. `python manage.py migrate`, 5. `npm ci && npm run build` et copie de `dist/`, 6. `systemctl restart allakro-api`, 7. `python manage.py verifier_coherence`.
- Contrôle de vulnérabilités avant chaque mise à jour : `pip-audit -r backend/requirements.txt` et `npm audit --omit=dev` (faits aussi par l'intégration continue `.github/workflows/ci.yml`).
