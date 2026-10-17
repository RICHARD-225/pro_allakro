from django.db import models
from django.db.models import F, Func, Q, Value
from django.db.models.functions import Lower
from django.utils import timezone

from .utils import AutoCodeMixin, normaliser_espaces, normaliser_libelle


def telephone_normalise_sql():
    """Téléphone réduit à ses chiffres (et +) en SQL : « 07 01 23 45 67 » et « 0701234567 » sont le même numéro."""
    return Func(F("telephone"), Value("[^0-9+]"), Value(""), Value("g"),
                function="REGEXP_REPLACE", output_field=models.CharField())


class Plantation(AutoCodeMixin, models.Model):
    code_prefix = "PLT-"

    code = models.CharField(max_length=30, unique=True, blank=True)
    nom = models.CharField(max_length=255)
    localisation = models.CharField(max_length=255, blank=True)
    unite_superficie = models.CharField(max_length=30, default="ha")
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plantation"
        ordering = ["nom"]

    def superficie_totale(self):
        """Superficie calculée : somme des superficies des blocs de tous ses campements (rien n'est saisi à ce niveau)."""
        return Bloc.objects.filter(campement__plantation=self).aggregate(t=models.Sum('superficie'))['t'] or 0

    def __str__(self):
        return self.nom


class Campement(AutoCodeMixin, models.Model):
    code_prefix = "CMP-"

    plantation = models.ForeignKey(Plantation, on_delete=models.PROTECT, related_name="campements")
    # Un campement a toujours un responsable (superviseur ou Super admin) : il gère tous les blocs du campement
    responsable = models.ForeignKey(
        'Personne',
        on_delete=models.PROTECT,
        related_name='campements_responsable',
        verbose_name='Responsable'
    )
    code = models.CharField(max_length=30, unique=True, blank=True)
    nom = models.CharField(max_length=255)
    localisation = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "campement"
        ordering = ["nom"]

    def superficie_totale(self):
        """Superficie calculée : somme des superficies de ses blocs (rien n'est saisi à ce niveau)."""
        return self.blocs.aggregate(t=models.Sum('superficie'))['t'] or 0

    def __str__(self):
        return self.nom


class Bloc(AutoCodeMixin, models.Model):
    code_prefix = "BLC-"

    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, related_name="blocs")
    code = models.CharField(max_length=50, unique=True, blank=True)
    nom = models.CharField(max_length=150)
    localisation = models.CharField(max_length=255, blank=True)
    superficie = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unite_superficie = models.CharField(max_length=30, default="ha")
    # Nombre de plantes présentes sur la superficie du bloc
    nombre_plantes = models.PositiveIntegerField(default=0)
    description = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bloc"
        ordering = ["code"]
        indexes = [models.Index(fields=["campement"], name="idx_bloc_campement")]
        constraints = [models.CheckConstraint(condition=models.Q(superficie__gte=0), name="ck_bloc_superficie_positive")]

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
    # Bloc d'affectation de la personne ; son campement est toujours celui du bloc
    bloc = models.ForeignKey(Bloc, on_delete=models.PROTECT, null=True, blank=True, related_name="personnes")
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
        constraints = [
            # Une personne n'existe qu'une fois : même nom et même prénom (sans tenir compte des majuscules)
            models.UniqueConstraint(Lower("nom"), Lower("prenom"), name="uniq_personne_nom_prenom"),
            # Un numéro de téléphone n'appartient qu'à une personne, quelle que soit sa mise en forme
            models.UniqueConstraint(telephone_normalise_sql(), condition=~Q(telephone=""), name="uniq_personne_telephone"),
        ]

    def __str__(self):
        return f"{self.prenom} {self.nom}"

    def save(self, *args, **kwargs):
        # Espaces normalisés : « Kouassi  Jean » et « Kouassi Jean » sont la même personne
        self.nom = normaliser_espaces(self.nom)
        self.prenom = normaliser_espaces(self.prenom)
        self.telephone = normaliser_espaces(self.telephone)
        if self.bloc_id:
            self.campement_id = self.bloc.campement_id
        super().save(*args, **kwargs)

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    # La fonction actuelle peut être préchargée (to_attr) pour éviter les requêtes en boucle
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
        constraints = [
            # « Chef de chantier », « chef de chantier » et « CHEF DE CHANTIER » sont la même fonction
            models.UniqueConstraint(Lower("libelle"), name="uniq_fonction_libelle_insensible"),
        ]

    def __str__(self):
        return self.libelle

    def save(self, *args, **kwargs):
        self.libelle = normaliser_libelle(self.libelle)
        super().save(*args, **kwargs)


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
    """Équipe créée avec un travail (nom libre, chef choisi parmi les personnes du travail)."""

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


class MembreEquipe(models.Model):
    """Historique des anciennes équipes permanentes (avant les équipes créées par travail), conservé en lecture seule."""

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
