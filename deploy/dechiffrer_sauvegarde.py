"""
Déchiffre une sauvegarde ALLAKRO chiffrée (.dump.chiffre) en fichier .dump utilisable par pg_restore.

    python deploy/dechiffrer_sauvegarde.py <fichier.dump.chiffre> <sortie.dump> [--cle <clé>]

La clé est celle de SAUVEGARDE_CLE (backend/.env), ou à défaut celle donnée avec --cle (copie conservée ailleurs : gestionnaire de mots de passe).
Ensuite : pg_restore -h localhost -U <utilisateur> -d <base vide> <sortie.dump>  (ou outils_tests/pg_outils.py copier <sortie.dump> <base de vérification>).
"""
import argparse
import os
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / 'deploy'))
sys.path.insert(0, str(RACINE / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'PRoAll.settings')

analyseur = argparse.ArgumentParser()
analyseur.add_argument('fichier')
analyseur.add_argument('sortie')
analyseur.add_argument('--cle')
args = analyseur.parse_args()

from decouple import config  # noqa: E402

from sauvegarde_postgres import dechiffrer  # noqa: E402

cle = args.cle or config('SAUVEGARDE_CLE', default='')
if not cle:
    sys.exit('Clé absente : renseignez SAUVEGARDE_CLE dans backend/.env ou utilisez --cle.')
try:
    dechiffrer(args.fichier, args.sortie, cle.encode())
except Exception as exc:  # clé incorrecte, fichier altéré ou tronqué
    Path(args.sortie).unlink(missing_ok=True)
    sys.exit(f'Déchiffrement impossible ({type(exc).__name__}) : clé incorrecte ou fichier altéré.')
print(f'Sauvegarde déchiffrée : {args.sortie}')
