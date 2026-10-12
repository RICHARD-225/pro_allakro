"""Sauvegarde (pg_dump) et copie de la base vers une base de vérification (pg_restore), sans afficher les identifiants.

    python pg_outils.py sauvegarder <fichier.dump>
    python pg_outils.py copier <fichier.dump> <base cible>     # crée la base cible et y restaure la sauvegarde
    python pg_outils.py supprimer <base cible>
"""
import os
import subprocess
import sys

import django

sys.path.insert(0, r'C:\Users\HP\Desktop\alakro\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'PRoAll.settings')
django.setup()

from django.conf import settings  # noqa: E402

BIN = r'C:\Program Files\PostgreSQL\18\bin'
db = settings.DATABASES['default']
env = {**os.environ, 'PGPASSWORD': db['PASSWORD']}
commun = ['-h', db['HOST'] or 'localhost', '-p', str(db['PORT'] or '5432'), '-U', db['USER']]


def lancer(args):
    resultat = subprocess.run(args, env=env, capture_output=True, text=True)
    if resultat.returncode != 0:
        print(resultat.stderr[-2000:])
        sys.exit(resultat.returncode)
    return resultat


action = sys.argv[1]
if action == 'sauvegarder':
    fichier = sys.argv[2]
    lancer([os.path.join(BIN, 'pg_dump.exe'), *commun, '-Fc', '-f', fichier, db['NAME']])
    print('sauvegarde écrite :', fichier, os.path.getsize(fichier), 'octets')
elif action == 'copier':
    fichier, cible = sys.argv[2], sys.argv[3]
    lancer([os.path.join(BIN, 'psql.exe'), *commun, '-d', 'postgres', '-c', f'DROP DATABASE IF EXISTS {cible} WITH (FORCE)'])
    lancer([os.path.join(BIN, 'psql.exe'), *commun, '-d', 'postgres', '-c', f'CREATE DATABASE {cible}'])
    lancer([os.path.join(BIN, 'pg_restore.exe'), *commun, '--no-owner', '-d', cible, fichier])
    print('copie restaurée dans', cible)
elif action == 'creer':
    cible = sys.argv[2]
    lancer([os.path.join(BIN, 'psql.exe'), *commun, '-d', 'postgres', '-c', f'DROP DATABASE IF EXISTS {cible} WITH (FORCE)'])
    lancer([os.path.join(BIN, 'psql.exe'), *commun, '-d', 'postgres', '-c', f'CREATE DATABASE {cible}'])
    print('base vide créée :', cible)
elif action == 'supprimer':
    lancer([os.path.join(BIN, 'psql.exe'), *commun, '-d', 'postgres', '-c', f'DROP DATABASE IF EXISTS {sys.argv[2]} WITH (FORCE)'])
    print('base supprimée :', sys.argv[2])
