from django.db import models

from apps.core.models import Personne


class RoleUtilisateur(models.Model):
    BIG_BOSS = "big_boss"
    SUPERVISEUR = "superviseur"

    code = models.CharField(max_length=50, unique=True)
    libelle = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "role_utilisateur"

    def __str__(self):
        return self.libelle


class Utilisateur(models.Model):
    personne = models.OneToOneField(Personne, on_delete=models.PROTECT, related_name="utilisateur")
    role = models.ForeignKey(RoleUtilisateur, on_delete=models.PROTECT, related_name="utilisateurs")
    # Identifiant de connexion (adresse e-mail)
    username = models.CharField(max_length=150, unique=True)
    password_hash = models.CharField(max_length=255)
    actif = models.BooleanField(default=True)
    derniere_connexion = models.DateTimeField(null=True, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "utilisateur"
        ordering = ["username"]

    def __str__(self):
        return self.username

    # Interface attendue par Django REST Framework (request.user)
    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active(self):
        return self.actif

    @property
    def is_big_boss(self):
        return self.role.code == RoleUtilisateur.BIG_BOSS

    @property
    def nom_complet(self):
        return self.personne.nom_complet


class Journal(models.Model):
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name="journaux")
    action = models.CharField(max_length=100)
    table_concernee = models.CharField(max_length=100, blank=True)
    objet_id = models.PositiveBigIntegerField(null=True, blank=True)
    details = models.CharField(max_length=255, blank=True)
    anciennes_donnees = models.JSONField(null=True, blank=True)
    nouvelles_donnees = models.JSONField(null=True, blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    date_action = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "journal"
        ordering = ["-date_action"]
        indexes = [
            models.Index(fields=["utilisateur", "date_action"], name="idx_journal_user_date"),
            models.Index(fields=["table_concernee", "objet_id"], name="idx_journal_objet"),
        ]
