from decimal import Decimal

from django.db import models

from apps.core.models import Bloc, Campement, Equipe, Personne
from apps.core.utils import AutoCodeMixin, periode_of
from apps.exploitation.models import TypeTravail

CENT = Decimal("0.01")


class CategorieDepense(AutoCodeMixin, models.Model):
    code_prefix = "CAT-"
    # Catégories système alimentées automatiquement (achats aux particuliers, paiements des salaires)
    CODE_ACHAT_PARTICULIERS = "CAT-ACH"
    LIBELLE_ACHAT_PARTICULIERS = "Achat de produits particuliers"
    CODE_SALAIRES = "CAT-SAL"
    LIBELLE_SALAIRES = "Salaires et rémunérations"

    code = models.CharField(max_length=50, unique=True, blank=True)
    libelle = models.CharField(max_length=150)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "categorie_depense"
        ordering = ["libelle"]

    def __str__(self):
        return self.libelle

    @property
    def systeme(self):
        return self.code in (self.CODE_ACHAT_PARTICULIERS, self.CODE_SALAIRES)

    @classmethod
    def achat_particuliers(cls):
        categorie, _ = cls.objects.get_or_create(
            code=cls.CODE_ACHAT_PARTICULIERS,
            defaults={"libelle": cls.LIBELLE_ACHAT_PARTICULIERS, "actif": True},
        )
        return categorie

    @classmethod
    def salaires(cls):
        categorie, _ = cls.objects.get_or_create(
            code=cls.CODE_SALAIRES, defaults={"libelle": cls.LIBELLE_SALAIRES, "actif": True},
        )
        return categorie


class Tiers(models.Model):
    nom = models.CharField(max_length=255)
    telephone = models.CharField(max_length=30, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    type_tiers = models.CharField(max_length=100, blank=True)
    observation = models.TextField(blank=True)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "tiers"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Depense(models.Model):
    # Une dépense est « Payée », ou « Avance » tant que la rémunération (ou l'achat) qu'elle règle n'est pas soldé(e)
    class Statut(models.TextChoices):
        AVANCE = 'AVANCE', 'Avance'
        PAYEE = 'PAYEE', 'Payée'

    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, related_name="depenses")
    statut = models.CharField(
        max_length=15,
        choices=Statut.choices,
        default=Statut.PAYEE
    )
    bloc = models.ForeignKey(Bloc, on_delete=models.PROTECT, null=True, blank=True, related_name="depenses")
    categorie = models.ForeignKey(CategorieDepense, on_delete=models.PROTECT, related_name="depenses")
    tiers = models.ForeignKey(Tiers, on_delete=models.SET_NULL, null=True, blank=True, related_name="depenses")
    date_depense = models.DateField()
    designation = models.CharField(max_length=255)
    quantite = models.DecimalField(max_digits=15, decimal_places=3, default=1)
    unite = models.CharField(max_length=50, blank=True)
    prix_unitaire = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    numero_justificatif = models.CharField(max_length=100, blank=True)
    justificatif = models.TextField(blank=True)
    observation = models.TextField(blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "depense"
        ordering = ["-date_depense", "-id"]
        indexes = [
            models.Index(fields=["campement", "date_depense"], name="idx_depense_camp_date"),
            models.Index(fields=["bloc", "date_depense"], name="idx_depense_bloc_date"),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(montant_total__gte=0), name="ck_depense_montant_positif"),
            models.CheckConstraint(condition=models.Q(quantite__gte=0, prix_unitaire__gte=0), name="ck_depense_qte_prix_positifs"),
        ]

    def __str__(self):
        return self.designation

    @property
    def periode(self):
        return periode_of(self.date_depense)

    def save(self, *args, **kwargs):
        # Le campement est toujours celui du bloc
        if self.bloc_id:
            self.campement_id = self.bloc.campement_id
        quantite = Decimal(self.quantite or 0)
        prix = Decimal(self.prix_unitaire or 0)
        if prix > 0 and quantite > 0:
            self.montant_total = (quantite * prix).quantize(CENT)
        elif quantite > 0:
            self.prix_unitaire = (Decimal(self.montant_total or 0) / quantite).quantize(CENT)
        super().save(*args, **kwargs)


class RegleRemuneration(models.Model):
    class ModeCalcul(models.TextChoices):
        QUANTITE = "QUANTITE", "Quantité"
        JOUR = "JOUR", "Jour"
        FIXE = "FIXE", "Fixe"
        MIXTE = "MIXTE", "Mixte"

    type_travail = models.ForeignKey(TypeTravail, on_delete=models.PROTECT, related_name="regles_remuneration")
    nom = models.CharField(max_length=150)
    mode_calcul = models.CharField(max_length=10, choices=ModeCalcul.choices, default=ModeCalcul.QUANTITE)
    tarif_unitaire = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_fixe = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    taux_ponction = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    actif = models.BooleanField(default=True)
    date_debut = models.DateField()
    date_fin = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "regle_remuneration"
        indexes = [
            models.Index(fields=["type_travail"], name="idx_regle_type"),
            models.Index(fields=["date_debut", "date_fin"], name="idx_regle_dates"),
        ]


class Salaire(models.Model):
    """
    Rémunération à payer : générée par un travail (montant du travail, personne = chef ou personne seule),
    ou saisie manuellement pour une personne sur un mois.
    """

    personne = models.ForeignKey(Personne, on_delete=models.PROTECT, related_name="salaires")
    travail = models.OneToOneField("exploitation.Travail", on_delete=models.PROTECT, null=True, blank=True,
                                   related_name="remuneration")
    bloc = models.ForeignKey(Bloc, on_delete=models.SET_NULL, null=True, blank=True, related_name="salaires")
    libelle = models.CharField(max_length=255, blank=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    montant_brut = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_ponction = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_net = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    # Annulation d'une rémunération saisie manuellement (celle d'un travail suit l'annulation du travail)
    annulee = models.BooleanField(default=False)
    observation = models.TextField(blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "salaire"
        ordering = ["-date_debut", "personne__nom"]
        indexes = [models.Index(fields=["personne", "date_debut", "date_fin"], name="idx_salaire_personne_periode")]
        constraints = [
            # Une seule rémunération manuelle par personne et par mois (celles des travaux sont uniques par travail)
            models.UniqueConstraint(fields=["personne", "date_debut"], condition=models.Q(travail__isnull=True),
                                    name="uniq_salaire_manuel_personne_periode"),
            models.CheckConstraint(condition=models.Q(montant_brut__gte=0, montant_ponction__gte=0, montant_net__gte=0),
                                   name="ck_salaire_montants_positifs"),
            models.CheckConstraint(condition=models.Q(date_fin__gte=models.F("date_debut")), name="ck_salaire_dates_coherentes"),
        ]

    @property
    def est_annulee(self):
        return self.annulee or bool(self.travail_id and self.travail.statut == "ANNULE")

    @property
    def periode(self):
        return periode_of(self.date_debut)

    def save(self, *args, **kwargs):
        # Net = brut − ponctions, toujours calculé côté serveur
        self.montant_net = (Decimal(self.montant_brut or 0) - Decimal(self.montant_ponction or 0)).quantize(CENT)
        super().save(*args, **kwargs)


class LigneSalaire(models.Model):
    salaire = models.ForeignKey(Salaire, on_delete=models.CASCADE, related_name="lignes")
    travail = models.ForeignKey("exploitation.Travail", on_delete=models.PROTECT, null=True, blank=True, related_name="lignes_salaire")
    regle = models.ForeignKey(RegleRemuneration, on_delete=models.PROTECT, null=True, blank=True, related_name="lignes_salaire")
    quantite = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    nombre_jours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    tarif = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "ligne_salaire"


class PaiementSalaire(AutoCodeMixin, models.Model):
    class TypePaiement(models.TextChoices):
        ESPECES = "ESPECES", "Espèces"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile Money"
        VIREMENT = "VIREMENT", "Virement"
        AUTRE = "AUTRE", "Autre"

    code_field = "numero"
    code_prefix = "PAY-"
    code_width = 5

    # Numéro du paiement, repris sur le reçu et sur la dépense
    numero = models.CharField(max_length=20, unique=True, blank=True)
    salaire = models.ForeignKey(Salaire, on_delete=models.PROTECT, related_name="paiements")
    # Personne qui a reçu l'argent : le chef d'équipe, un membre ou la personne seule
    beneficiaire = models.ForeignKey(Personne, on_delete=models.PROTECT, null=True, blank=True, related_name="paiements_recus")
    montant = models.DecimalField(max_digits=15, decimal_places=2)
    date_paiement = models.DateField()
    type_paiement = models.CharField(max_length=20, choices=TypePaiement.choices)
    reference = models.CharField(max_length=150, blank=True)
    # Avance versée à la création du travail
    est_avance = models.BooleanField(default=False)
    # Équipe et groupe : paiements enregistrés ensemble (ancien paiement par équipe, paiement de plusieurs rémunérations)
    equipe = models.ForeignKey(Equipe, on_delete=models.SET_NULL, null=True, blank=True, related_name="paiements_salaire")
    groupe = models.CharField(max_length=40, blank=True, db_index=True)
    # Dépense créée automatiquement pour ce paiement (une seule par paiement)
    depense = models.OneToOneField(Depense, on_delete=models.SET_NULL, null=True, blank=True, related_name="paiement_salaire")
    observation = models.TextField(blank=True)
    # Un paiement annulé reste dans l'historique (numéro, reçu) mais ne compte plus : ni dans le payé, ni dans les
    # totaux, ni dans les dépenses (sa dépense est supprimée avec l'annulation).
    annule = models.BooleanField(default=False)
    date_annulation = models.DateTimeField(null=True, blank=True)
    motif_annulation = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "paiement_salaire"
        ordering = ["-date_paiement", "-id"]
        indexes = [models.Index(fields=["salaire", "date_paiement"], name="idx_paiement_sal_date")]
        constraints = [models.CheckConstraint(condition=models.Q(montant__gt=0), name="ck_paiement_salaire_montant_positif")]


class ClotureMensuelle(models.Model):
    """
    Clôture d'un mois : les chiffres du mois sont figés (copie dans `resume`) et plus aucune écriture n'est possible sur ses
    données (travaux, dépenses, paiements, achats, mouvements de stock) tant que le Super admin ne l'a pas rouvert.
    """

    periode = models.CharField(max_length=7, unique=True)  # AAAA-MM
    cloturee = models.BooleanField(default=True)
    date_cloture = models.DateTimeField(null=True, blank=True)
    cloturee_par = models.ForeignKey("accounts.Utilisateur", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    resume = models.JSONField(default=dict, blank=True)
    commentaire = models.CharField(max_length=255, blank=True)
    date_reouverture = models.DateTimeField(null=True, blank=True)
    reouverte_par = models.ForeignKey("accounts.Utilisateur", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        db_table = "cloture_mensuelle"
        ordering = ["-periode"]

    def __str__(self):
        return f"{self.periode} ({'clôturé' if self.cloturee else 'rouvert'})"


class Prevision(models.Model):
    # Module « Prévisions » retiré le 11 octobre 2026 (plus d'écran, d'API, de rapport ni de tableau de bord).
    # La table et ses données sont conservées telles quelles : aucune suppression sans décision explicite.
    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, related_name="previsions")
    bloc = models.ForeignKey(Bloc, on_delete=models.PROTECT, null=True, blank=True, related_name="previsions")
    categorie = models.ForeignKey(CategorieDepense, on_delete=models.PROTECT, null=True, blank=True, related_name="previsions")
    periode_debut = models.DateField()
    periode_fin = models.DateField()
    designation = models.CharField(max_length=255)
    montant_prevu = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "prevision"
        ordering = ["-periode_debut", "id"]
        indexes = [models.Index(fields=["campement", "periode_debut", "periode_fin"], name="idx_prevision_periode")]

    @property
    def periode(self):
        return periode_of(self.periode_debut)


class BilanMensuel(models.Model):
    campement = models.ForeignKey(Campement, on_delete=models.PROTECT, null=True, blank=True, related_name="bilans")
    annee = models.PositiveIntegerField()
    mois = models.PositiveSmallIntegerField()
    date_generation = models.DateTimeField(auto_now_add=True)
    statut = models.CharField(max_length=30, default="BROUILLON")
    commentaire = models.TextField(blank=True)

    class Meta:
        db_table = "bilan_mensuel"
        indexes = [models.Index(fields=["campement", "annee", "mois"], name="idx_bilan_periode")]

    def __str__(self):
        scope = self.campement.nom if self.campement else "Global"
        return f"{scope} - {self.mois:02d}/{self.annee}"
