"""
Sauvegarde automatique de la base PostgreSQL d'ALLAKRO (pg_dump, format compressé), avec rotation, chiffrement et copie hors machine.

    python deploy/sauvegarde_postgres.py <dossier> [--garder 14] [--copie <deuxième dossier>] [--chiffrer] [--verifier]

- crée <dossier>/allakro_AAAAMMJJ_HHMMSS.dump et supprime les sauvegardes de plus de N jours (14 par défaut) ;
- --verifier : relit la sauvegarde avec pg_restore --list (contrôle qu'elle est exploitable) ;
- --chiffrer : la copie hors machine est chiffrée (AES, clé SAUVEGARDE_CLE de backend/.env, créée au premier usage) : un dossier
  synchronisé (OneDrive…) ne contient jamais la base en clair ;
- --copie : copie aussi la sauvegarde (chiffrée si --chiffrer) dans un second emplacement hors de la machine : dossier synchronisé,
  autre disque, dossier réseau. La même rotation s'y applique ;
- aucun mot de passe ni clé n'est affiché ; les identifiants viennent des réglages Django (backend/.env).

⚠ La clé SAUVEGARDE_CLE doit aussi être conservée AILLEURS (gestionnaire de mots de passe, papier) : sans elle, les copies chiffrées sont
illisibles si cette machine est perdue. Restauration : deploy/dechiffrer_sauvegarde.py puis pg_restore.
Planification : voir deploy/DEPLOIEMENT.md (tâche planifiée Windows ou cron).
"""
import argparse
import os
import shutil
import struct
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import django
from cryptography.fernet import Fernet

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'PRoAll.settings')
django.setup()

from django.conf import settings  # noqa: E402

ENTETE = b'ALLAKROBK1'   # format : entête, puis blocs [taille sur 4 octets][jeton Fernet] de 8 Mo en clair au plus
BLOC = 8 * 1024 * 1024


def trouver(outil):
    dossier = os.environ.get('PG_BIN')
    candidats = [Path(dossier) / outil] if dossier else []
    candidats += [Path(r'C:\Program Files\PostgreSQL\18\bin') / f'{outil}.exe', Path(f'/usr/bin/{outil}')]
    for c in candidats:
        if c.exists():
            return str(c)
    return shutil.which(outil) or outil


def cle_de_chiffrement():
    """Clé SAUVEGARDE_CLE de backend/.env (créée si absente). Jamais affichée."""
    from decouple import config
    cle = config('SAUVEGARDE_CLE', default='')
    if cle:
        return cle.encode()
    nouvelle = Fernet.generate_key().decode()
    with open(RACINE / 'backend' / '.env', 'a', encoding='utf-8') as f:
        f.write(f"\n# Clé de chiffrement des sauvegardes copiées hors de la machine : à conserver AUSSI ailleurs (gestionnaire de mots de passe)\nSAUVEGARDE_CLE={nouvelle}\n")
    print("Une clé de chiffrement a été créée dans backend/.env (SAUVEGARDE_CLE) : conservez-en une copie ailleurs.")
    return nouvelle.encode()


def chiffrer(source, destination, cle):
    fernet = Fernet(cle)
    with open(source, 'rb') as entree, open(destination, 'wb') as sortie:
        sortie.write(ENTETE)
        while True:
            bloc = entree.read(BLOC)
            if not bloc:
                break
            jeton = fernet.encrypt(bloc)
            sortie.write(struct.pack('>I', len(jeton)) + jeton)


def dechiffrer(source, destination, cle):
    fernet = Fernet(cle)
    with open(source, 'rb') as entree, open(destination, 'wb') as sortie:
        if entree.read(len(ENTETE)) != ENTETE:
            raise ValueError("Ce fichier n'est pas une sauvegarde ALLAKRO chiffrée.")
        while True:
            taille = entree.read(4)
            if not taille:
                break
            sortie.write(fernet.decrypt(entree.read(struct.unpack('>I', taille)[0])))


def appliquer_rotation(dossier, motif, garder, exception=None):
    limite = time.time() - garder * 86400
    for ancien in dossier.glob(motif):
        if ancien != exception and ancien.stat().st_mtime < limite:
            ancien.unlink()
            print(f'Ancienne sauvegarde supprimée : {ancien.name}')


def main():
    analyseur = argparse.ArgumentParser()
    analyseur.add_argument('dossier')
    analyseur.add_argument('--garder', type=int, default=14, help='nombre de jours de sauvegardes conservés')
    analyseur.add_argument('--copie', help='second emplacement (hors machine) où copier la sauvegarde')
    analyseur.add_argument('--chiffrer', action='store_true', help='chiffrer la copie hors machine')
    analyseur.add_argument('--verifier', action='store_true')
    args = analyseur.parse_args()

    base = settings.DATABASES['default']
    env = {**os.environ, 'PGPASSWORD': base['PASSWORD']}
    commun = ['-h', base['HOST'] or 'localhost', '-p', str(base['PORT'] or '5432'), '-U', base['USER']]
    dossier = Path(args.dossier)
    dossier.mkdir(parents=True, exist_ok=True)
    fichier = dossier / f"allakro_{datetime.now():%Y%m%d_%H%M%S}.dump"

    resultat = subprocess.run([trouver('pg_dump'), *commun, '-Fc', '-f', str(fichier), base['NAME']], env=env, capture_output=True, text=True)
    if resultat.returncode != 0:
        fichier.unlink(missing_ok=True)
        sys.exit(f"Échec de la sauvegarde : {resultat.stderr[-500:]}")
    print(f'Sauvegarde écrite : {fichier} ({fichier.stat().st_size} octets)')

    if args.verifier:
        controle = subprocess.run([trouver('pg_restore'), '--list', str(fichier)], capture_output=True, text=True)
        if controle.returncode != 0:
            sys.exit(f'Sauvegarde illisible : {controle.stderr[-300:]}')
        print('Sauvegarde vérifiée (pg_restore --list).')

    if args.copie:
        destination = Path(args.copie)
        destination.mkdir(parents=True, exist_ok=True)
        if args.chiffrer:
            cle = cle_de_chiffrement()  # une seule lecture : la clé créée au premier usage est réutilisée telle quelle
            copie = destination / (fichier.name + '.chiffre')
            chiffrer(fichier, copie, cle)
            # Contrôle : la copie chiffrée doit redonner exactement la sauvegarde
            temporaire = destination / '.verification.tmp'
            dechiffrer(copie, temporaire, cle)
            identique = temporaire.read_bytes() == fichier.read_bytes()
            temporaire.unlink(missing_ok=True)
            if not identique:
                copie.unlink(missing_ok=True)
                sys.exit('Copie chiffrée invalide (contrôle de relecture échoué) : supprimée.')
            print(f'Copie chiffrée écrite et relue avec succès : {copie}')
        else:
            copie = destination / fichier.name
            shutil.copy2(fichier, copie)
            print(f'Copie écrite : {copie}')
        appliquer_rotation(destination, 'allakro_*.dump*', args.garder, exception=copie)

    appliquer_rotation(dossier, 'allakro_*.dump', args.garder, exception=fichier)


if __name__ == '__main__':
    main()
