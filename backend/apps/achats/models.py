from decimal import Decimal

from django.db import models

from apps.core.utils import AutoCodeMixin


class Particulier(models.Model):
    """Personne extérieure à qui l'exploitation achète des produits."""

    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    observation = models.TextField(blank=True)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "particulier"
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.nom} {self.prenom}".strip()


class AchatParticulier(AutoCodeMixin, models.Model):
    code_field = "reference"
    code_prefix = "ACH-"
    code_width = 4

    reference = models.CharField(max_length=30, unique=True, blank=True)
    particulier = models.ForeignKey(Particulier, on_delete=models.PROTECT, related_name="achats")
    campement = models.ForeignKey("core.Campement", on_delete=models.PROTECT, related_name="achats_particuliers")
    bloc = models.ForeignKey("core.Bloc", on_delete=models.PROTECT, null=True, blank=True, related_name="achats_particuliers")
    # Chaque achat est aussi comptabilisé comme une dépense
    depense = models.OneToOneField(
        "finances.Depense", on_delete=models.SET_NULL, null=True, blank=True, related_name="achat_particulier",
    )
    designation = models.CharField(max_length=255)
    date_achat = models.DateField()
    poids = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    unite_poids = models.CharField(max_length=30, default="kg")
    prix_unitaire = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "achat_particulier"
        ordering = ["-date_achat", "-id"]
        indexes = [models.Index(fields=["particulier", "date_achat"], name="idx_achat_part_date")]
        constraints = [
            models.CheckConstraint(condition=models.Q(poids__gte=0, prix_unitaire__gte=0, montant_total__gte=0),
                                   name="ck_achat_valeurs_positives"),
        ]

    def __str__(self):
        return self.reference

    def save(self, *args, **kwargs):
        # Montant = poids/quantité × prix unitaire ; campement = celui du bloc
        self.montant_total = (Decimal(self.poids or 0) * Decimal(self.prix_unitaire or 0)).quantize(Decimal("0.01"))
        if self.bloc_id:
            self.campement_id = self.bloc.campement_id
        super().save(*args, **kwargs)


class PaiementAchat(models.Model):
    class TypePaiement(models.TextChoices):
        ESPECES = "ESPECES", "Espèces"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile Money"
        VIREMENT = "VIREMENT", "Virement"
        AUTRE = "AUTRE", "Autre"

    achat = models.ForeignKey(AchatParticulier, on_delete=models.PROTECT, related_name="paiements")
    montant = models.DecimalField(max_digits=15, decimal_places=2)
    date_paiement = models.DateField()
    type_paiement = models.CharField(max_length=20, choices=TypePaiement.choices)
    reference = models.CharField(max_length=150, blank=True)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "paiement_achat"
        ordering = ["-date_paiement", "-id"]
        indexes = [models.Index(fields=["achat", "date_paiement"], name="idx_paiement_achat_date")]
        constraints = [models.CheckConstraint(condition=models.Q(montant__gt=0), name="ck_paiement_achat_montant_positif")]
