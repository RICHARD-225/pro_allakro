from django.db import models
from django.utils import timezone

from .utils import AutoCodeMixin


class Plantation(AutoCodeMixin, models.Model):
    code_prefix = "PLT-"

    code = models.CharField(max_length=30, unique=True, blank=True)
    nom = models.CharField(max_length=255)
    localisation = models.CharField(max_length=255, blank=True)
    superficie = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unite_superficie = models.CharField(max_length=30, default="ha")
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plantation"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Campement(AutoCodeMixin, models.Model):
    code_prefix = "CMP-"

    plantation = models.ForeignKey(Plantation, on_delete=models.PROTECT, related_name="campements")
    responsable = models.ForeignKey(
        'Personne',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='campements_responsable',
        verbose_name='Responsable'
    )
    code = models.CharField(max_length=30, unique=True, blank=True)
    nom = models.CharField(max_length=255)
    localisation = models.CharField(max_length=255, blank=True)
    superficie = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "campement"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Bloc(AutoCodeMixin, models.Model):
    code_prefix = "BLC-"

    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, related_name="blocs")
    code = models.CharField(max_length=50, unique=True, blank=True)
    nom = models.CharField(max_length=150)
    superficie = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unite_superficie = models.CharField(max_length=30, default="ha")
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bloc"
        ordering = ["code"]
        indexes = [models.Index(fields=["campement"], name="idx_bloc_campement")]

    def __str__(self):
        return f"{self.code} - {self.nom}"


class Personne(AutoCodeMixin, models.Model):
    code_field = "matricule"
    code_prefix = "MAT-"
    code_width = 4

    matricule = models.CharField(max_length=50, unique=True, blank=True)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    telephone = models.CharField(max_length=30, blank=True)
    # Campement de rattachement (déduit de l'équipe quand la personne en a une)
    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, null=True, blank=True, related_name="personnes")
    date_embauche = models.DateField(null=True, blank=True)
    actif = models.BooleanField(default=True)
    adresse = models.CharField(max_length=250, blank=True)
    observation = models.TextField(blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "personne"
        ordering = ["nom", "prenom"]
        indexes = [
            models.Index(fields=["nom", "prenom"], name="idx_personne_nom"),
            models.Index(fields=["telephone"], name="idx_personne_tel"),
        ]

    def __str__(self):
        return f"{self.prenom} {self.nom}"

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    # Les historiques peuvent être préchargés (to_attr) pour éviter les requêtes en boucle
    def membership_actuel(self):
        memberships = getattr(self, "memberships_actuels", None)
        if memberships is None:
            memberships = list(self.participations_equipes.filter(date_fin__isnull=True).select_related("equipe"))
        return memberships[0] if memberships else None

    def fonction_actuelle(self):
        fonctions = getattr(self, "fonctions_actuelles", None)
        if fonctions is None:
            fonctions = list(self.fonctions.filter(date_fin__isnull=True, principal=True).select_related("fonction"))
        return fonctions[0].fonction if fonctions else None


class Fonction(models.Model):
    libelle = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "fonction"
        ordering = ["libelle"]

    def __str__(self):
        return self.libelle


class PersonneFonction(models.Model):
    personne = models.ForeignKey(Personne, on_delete=models.CASCADE, related_name="fonctions")
    fonction = models.ForeignKey(Fonction, on_delete=models.PROTECT, related_name="personnes")
    date_debut = models.DateField()
    date_fin = models.DateField(null=True, blank=True)
    principal = models.BooleanField(default=False)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "personne_fonction"
        indexes = [models.Index(fields=["fonction"], name="idx_pf_fonction")]


class Equipe(AutoCodeMixin, models.Model):
    code_prefix = "EQ-"

    chef = models.ForeignKey(Personne, on_delete=models.SET_NULL, null=True, blank=True, related_name="equipes_dirigees")
    code = models.CharField(max_length=30, unique=True, blank=True)
    nom = models.CharField(max_length=100)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "equipe"
        ordering = ["nom"]
        indexes = [models.Index(fields=["chef"], name="idx_equipe_chef")]

    def __str__(self):
        return self.nom

    def affectation_actuelle(self):
        affectations = getattr(self, "affectations_actuelles", None)
        if affectations is None:
            affectations = list(self.affectations_blocs.filter(date_fin__isnull=True).select_related("bloc__campement"))
        return affectations[0] if affectations else None

    def membres_actuels(self):
        membres = getattr(self, "membres_en_cours", None)
        if membres is None:
            membres = list(self.membres.filter(date_fin__isnull=True))
        return membres


class MembreEquipe(models.Model):
    personne = models.ForeignKey(Personne, on_delete=models.CASCADE, related_name="participations_equipes")
    equipe = models.ForeignKey(Equipe, on_delete=models.PROTECT, related_name="membres")
    date_debut = models.DateField(default=timezone.localdate)
    date_fin = models.DateField(null=True, blank=True)
    role_dans_equipe = models.CharField(max_length=100, blank=True)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "membre_equipe"
        indexes = [models.Index(fields=["personne"], name="idx_membre_personne")]


class AffectationEquipeBloc(models.Model):
    bloc = models.ForeignKey(Bloc, on_delete=models.PROTECT, related_name="affectations_equipes")
    equipe = models.ForeignKey(Equipe, on_delete=models.PROTECT, related_name="affectations_blocs")
    date_debut = models.DateField(default=timezone.localdate)
    date_fin = models.DateField(null=True, blank=True)
    responsable = models.BooleanField(default=False)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "affectation_equipe_bloc"
        indexes = [
            models.Index(fields=["equipe"], name="idx_affectation_equipe"),
            models.Index(fields=["bloc"], name="idx_affectation_bloc"),
        ]
