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
    # Incrémentée quand les sessions ouvertes doivent cesser de valoir (mot de passe, rôle ou état du compte modifié,
    # réutilisation d'un jeton révoqué) : les jetons déjà émis portent l'ancienne version et sont refusés.
    token_version = models.PositiveIntegerField(default=0)

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

    @property
    def campement_id(self):
        """Campement du compte (celui du bloc de sa fiche du personnel) : le périmètre d'un superviseur."""
        personne = self.personne
        return personne.bloc.campement_id if personne.bloc_id else personne.campement_id

    def campements_autorises(self):
        """None = toute l'exploitation (Big Boss) ; sinon la liste des campements visibles (vide si aucun n'est affecté)."""
        if self.is_big_boss:
            return None
        # Un responsable peut gérer plusieurs campements : ceux dont sa fiche est « responsable » (actifs) et celui de son bloc
        ids = list(self.personne.campements_responsable.filter(actif=True).order_by('nom').values_list('pk', flat=True))
        if self.campement_id and self.campement_id not in ids:
            ids.insert(0, self.campement_id)
        return ids


class JetonRevoque(models.Model):
    """Jetons (identifiant `jti`) invalidés avant leur expiration : déconnexion, rotation du jeton de session."""

    jti = models.CharField(max_length=64, unique=True)
    expire_le = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "jeton_revoque"


class TentativeConnexion(models.Model):
    """Tentatives de connexion : permettent de bloquer temporairement un compte ou une adresse IP après trop d'échecs."""

    identifiant = models.CharField(max_length=150, db_index=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    reussie = models.BooleanField(default=False)
    date = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "tentative_connexion"
        ordering = ["-date"]
        indexes = [models.Index(fields=["adresse_ip", "date"], name="idx_tentative_ip_date")]


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


class ReinitialisationMotDePasse(models.Model):
    """Demande « mot de passe oublié » : seule l'empreinte (SHA-256) du jeton est conservée ; le jeton ne sert qu'une fois, 30 minutes."""

    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name="reinitialisations")
    empreinte = models.CharField(max_length=64, unique=True)
    expire_le = models.DateTimeField()
    utilise_le = models.DateTimeField(null=True, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "reinitialisation_mot_de_passe"
        ordering = ["-date_creation"]
        indexes = [models.Index(fields=["utilisateur", "date_creation"], name="idx_reinit_user_date")]


class Notification(models.Model):
    """Notification affichée dans l'application (cloche) à un utilisateur."""

    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=40)
    titre = models.CharField(max_length=150)
    message = models.CharField(max_length=255, blank=True)
    lien = models.CharField(max_length=150, blank=True)
    # Clé de déduplication : une même alerte n'est créée qu'une fois par utilisateur (vide = jamais dédupliquée)
    cle = models.CharField(max_length=120, blank=True)
    lue = models.BooleanField(default=False)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notification"
        ordering = ["-date_creation", "-id"]
        indexes = [models.Index(fields=["utilisateur", "lue", "date_creation"], name="idx_notif_user_lue")]
        constraints = [
            models.UniqueConstraint(fields=["utilisateur", "cle"], condition=~models.Q(cle=""), name="uniq_notification_cle"),
        ]
