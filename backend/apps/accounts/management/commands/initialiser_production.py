"""
Premier démarrage d'une base vide (hébergement sans terminal, ex. Render gratuit) : crée les rôles et les comptes Big Boss
décrits par des variables d'environnement. Sans danger à chaque démarrage : un compte déjà présent n'est jamais modifié.

    BIG_BOSS_1_EMAIL, BIG_BOSS_1_MOT_DE_PASSE, BIG_BOSS_1_PRENOM, BIG_BOSS_1_NOM
    BIG_BOSS_2_EMAIL, BIG_BOSS_2_MOT_DE_PASSE, BIG_BOSS_2_PRENOM, BIG_BOSS_2_NOM   (facultatif : second compte, ex. le client)

Les mots de passe ne sont jamais affichés. Ils doivent respecter la règle de l'application (10 caractères, majuscule,
minuscule, chiffre) ; sinon le compte n'est pas créé et la commande échoue avec un message clair.
"""
import os

from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import RoleUtilisateur, Utilisateur
from apps.core.models import Personne

ROLES = (
    (RoleUtilisateur.BIG_BOSS, 'Big Boss', 'Accès complet, administration'),
    (RoleUtilisateur.SUPERVISEUR, 'Superviseur', 'Saisie des opérations de terrain'),
)


class Command(BaseCommand):
    help = "Crée les rôles et les comptes Big Boss d'une base vide à partir des variables BIG_BOSS_1_* et BIG_BOSS_2_*."

    def handle(self, *args, **options):
        for code, libelle, description in ROLES:
            _, cree = RoleUtilisateur.objects.get_or_create(code=code, defaults={'libelle': libelle, 'description': description})
            if cree:
                self.stdout.write(f"Rôle créé : {libelle}")
        role = RoleUtilisateur.objects.get(code=RoleUtilisateur.BIG_BOSS)

        configures = 0
        for numero in (1, 2):
            lire = lambda nom: os.environ.get(f'BIG_BOSS_{numero}_{nom}', '').strip()  # noqa: E731
            email = lire('EMAIL').lower()
            if not email:
                continue
            configures += 1
            mot_de_passe = os.environ.get(f'BIG_BOSS_{numero}_MOT_DE_PASSE', '')
            if Utilisateur.objects.filter(username=email).exists():
                self.stdout.write(f"Compte Big Boss {numero} déjà présent : inchangé.")
                continue
            if not mot_de_passe:
                raise CommandError(f"BIG_BOSS_{numero}_MOT_DE_PASSE est obligatoire pour créer le compte {email}.")
            try:
                validate_password(mot_de_passe)
            except ValidationError as erreur:
                raise CommandError(f"Mot de passe du compte Big Boss {numero} refusé : {' '.join(erreur.messages)}")
            with transaction.atomic():
                personne = Personne.objects.create(prenom=lire('PRENOM') or 'Big', nom=lire('NOM') or 'Boss')
                Utilisateur.objects.create(personne=personne, role=role, username=email, password_hash=make_password(mot_de_passe))
            self.stdout.write(self.style.SUCCESS(f"Compte Big Boss {numero} créé : {email}"))

        if not configures and not Utilisateur.objects.exists():
            self.stdout.write(self.style.WARNING(
                "Aucun compte n'existe et aucune variable BIG_BOSS_1_EMAIL n'est définie : personne ne pourra se connecter."))
