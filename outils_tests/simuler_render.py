"""
Simule le démarrage de l'API sur Render, en local, sur une base VIDE (jamais allakro_db) :
    DATABASE_URL -> migrate -> initialiser_production -> serveur en mode production -> connexion, sonde de santé, en-têtes.

    python simuler_render.py <nom d'une base vide existante>      (création : python pg_outils.py creer <nom>)

Les identifiants de PostgreSQL sont lus dans backend/.env sans être affichés. Le serveur écoute sur 127.0.0.1:8003.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BACKEND = RACINE / 'backend'
PYTHON = RACINE / 'env' / 'Scripts' / 'python.exe'
PORT = 8003

if len(sys.argv) < 2 or sys.argv[1] in ('allakro_db',):
    sys.exit("Donnez le nom d'une base vide de test (jamais allakro_db).")
base = sys.argv[1]

env_fichier = {}
for ligne in (BACKEND / '.env').read_text(encoding='utf8').splitlines():
    if '=' in ligne and not ligne.startswith('#'):
        cle, valeur = ligne.split('=', 1)
        env_fichier[cle.strip()] = valeur.strip().strip('"\'')
url = (f"postgresql://{urllib.parse.quote(env_fichier['DB_USER'], safe='')}:{urllib.parse.quote(env_fichier.get('DB_PASSWORD', ''), safe='')}"
       f"@{env_fichier.get('DB_HOST', 'localhost')}:{env_fichier.get('DB_PORT', '5432')}/{base}?sslmode=prefer")

env = {k: v for k, v in os.environ.items() if not k.startswith(('DB_', 'CACHE_', 'EMAIL_'))}
env.update({
    'PYTHONUTF8': '1', 'DATABASE_URL': url, 'DEBUG': 'False', 'SECRET_KEY': 'x' * 64, 'JWT_SIGNING_KEY': 'y' * 64,
    'ALLOWED_HOSTS': '127.0.0.1,localhost', 'CORS_ALLOWED_ORIGINS': f'http://127.0.0.1:{PORT}',
    'CSRF_TRUSTED_ORIGINS': f'http://127.0.0.1:{PORT}', 'SECURE_SSL_REDIRECT': 'False', 'SECURE_HSTS_SECONDS': '0',
    'CACHE_BACKEND': 'locmem',
    'BIG_BOSS_1_EMAIL': 'proprietaire@exemple.ci', 'BIG_BOSS_1_MOT_DE_PASSE': 'Proprio@Test2026', 'BIG_BOSS_1_PRENOM': 'Richard', 'BIG_BOSS_1_NOM': 'K',
    'BIG_BOSS_2_EMAIL': 'client@exemple.ci', 'BIG_BOSS_2_MOT_DE_PASSE': 'Client@Test2026', 'BIG_BOSS_2_PRENOM': 'Awa', 'BIG_BOSS_2_NOM': 'Client',
})

ok = ko = 0


def verifier(condition, nom, detail=''):
    global ok, ko
    if condition:
        ok += 1
        print('OK   ', nom, detail)
    else:
        ko += 1
        print('ÉCHEC', nom, detail)


def manage(*args):
    return subprocess.run([str(PYTHON), 'manage.py', *args], cwd=BACKEND, env=env, capture_output=True, text=True, encoding='utf8')


migration = manage('migrate', '--noinput')
verifier(migration.returncode == 0, 'migrate sur la base vide via DATABASE_URL', migration.stderr[-200:])
for tour in (1, 2):  # deux démarrages de suite : le second ne doit rien changer
    init = manage('initialiser_production')
    verifier(init.returncode == 0, f'initialiser_production (démarrage {tour})', init.stdout.strip().replace('\n', ' | ')[:160])
verifier('Mot' not in init.stdout and 'Test2026' not in init.stdout + init.stderr, 'aucun mot de passe affiché')
import secrets  # noqa: E402

env_prod = {**env, 'SECRET_KEY': secrets.token_urlsafe(64), 'JWT_SIGNING_KEY': secrets.token_urlsafe(64), 'SECURE_SSL_REDIRECT': 'True',
            'SECURE_PROXY_SSL': 'True', 'ALLOWED_HOSTS': 'allakro-richard225-api.onrender.com'}
env_prod.pop('SECURE_HSTS_SECONDS', None)
deploy = subprocess.run([str(PYTHON), 'manage.py', 'check', '--deploy'], cwd=BACKEND, env=env_prod, capture_output=True, text=True, encoding='utf8')
verifier(deploy.returncode == 0 and 'no issues' in (deploy.stdout + deploy.stderr).lower(), 'check --deploy sans alerte', (deploy.stdout + deploy.stderr)[-160:].replace('\n', ' '))

serveur = subprocess.Popen([str(PYTHON), 'manage.py', 'runserver', f'127.0.0.1:{PORT}', '--noreload'], cwd=BACKEND, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/v1/sante/', timeout=2)
            break
        except Exception:
            time.sleep(1)
    cookies = {}

    def appel(chemin, donnees=None, entetes=None):
        tous = {'Content-Type': 'application/json', **(entetes or {})}
        if cookies:
            tous['Cookie'] = '; '.join(f'{k}={v}' for k, v in cookies.items())
        requete = urllib.request.Request(f'http://127.0.0.1:{PORT}{chemin}', data=json.dumps(donnees).encode() if donnees is not None else None, headers=tous)
        try:
            with urllib.request.urlopen(requete, timeout=15) as reponse:
                statut, tetes, corps = reponse.status, reponse.headers, reponse.read().decode()
        except urllib.error.HTTPError as erreur:
            statut, tetes, corps = erreur.code, erreur.headers, erreur.read().decode()
        for cookie in tetes.get_all('Set-Cookie') or []:  # on retient les cookies même « Secure » (HTTP local)
            nom, _, reste = cookie.partition('=')
            valeur = reste.split(';')[0]
            if valeur in ('', '""') or 'Max-Age=0' in cookie:
                cookies.pop(nom, None)
            else:
                cookies[nom] = valeur
        return statut, dict(tetes), corps

    statut, entetes, corps = appel('/api/v1/sante/')
    verifier(statut == 200 and '"ok": true' in corps.replace('":true', '": true'), 'sonde de santé (base joignable)', corps[:60])
    jeton = json.loads(appel('/api/v1/auth/csrf/')[2])['csrfToken']
    for email, mdp in (('proprietaire@exemple.ci', 'Proprio@Test2026'), ('client@exemple.ci', 'Client@Test2026')):
        statut, _, corps = appel('/api/v1/auth/login/', {'username': email, 'password': mdp}, {'X-CSRFToken': jeton, 'Origin': f'http://127.0.0.1:{PORT}'})
        verifier(statut == 200, f'connexion {email}', str(statut))
        statut, _, corps = appel('/api/v1/auth/me/')
        verifier(statut == 200 and json.loads(corps)['role'] == 'big_boss', f'profil Super admin {email}')
        cookies.clear()
        jeton = json.loads(appel('/api/v1/auth/csrf/')[2])['csrfToken']
    statut, _, _ = appel('/api/v1/auth/login/', {'username': 'proprietaire@exemple.ci', 'password': 'faux'}, {'X-CSRFToken': jeton})
    verifier(statut == 401, 'mauvais mot de passe refusé', str(statut))
    statut, _, _ = appel('/api/v1/plantations/')
    verifier(statut in (401, 403), 'API fermée sans connexion', str(statut))
    statut, entetes, _ = appel('/api/v1/auth/csrf/')
    verifier(entetes.get('X-Content-Type-Options') == 'nosniff', 'en-têtes de sécurité présents')
finally:
    serveur.terminate()

print(f'\n{ok} vérifications réussies, {ko} échec(s)')
sys.exit(1 if ko else 0)
