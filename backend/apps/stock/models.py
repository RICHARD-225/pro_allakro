from decimal import Decimal

from django.db import models
from django.db.models import Case, DecimalField, F, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.core.models import Bloc
from apps.core.utils import AutoCodeMixin

ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=15, decimal_places=3))


def stock_expression(prefix=""):
    """Stock = Σ entrées − Σ sorties + Σ ajustements (quantité signée), calculé en SQL."""
    signe = Case(
        When(**{f"{prefix}type_mouvement": "SORTIE"}, then=-F(f"{prefix}quantite")),
        default=F(f"{prefix}quantite"),
        output_field=DecimalField(max_digits=15, decimal_places=3),
    )
    return Coalesce(Sum(signe), ZERO)


class ProduitQuerySet(models.QuerySet):
    def avec_stock(self):
        signe = Case(
            When(mouvements__type_mouvement="SORTIE", then=-F("mouvements__quantite")),
            default=F("mouvements__quantite"),
            output_field=DecimalField(max_digits=15, decimal_places=3),
        )
        return self.annotate(stock_calcule=Coalesce(Sum(signe), ZERO))


class Produit(AutoCodeMixin, models.Model):
    code_prefix = "PRD-"

    code = models.CharField(max_length=50, unique=True, blank=True)
    nom = models.CharField(max_length=150)
    categorie = models.CharField(max_length=100, blank=True)
    unite = models.CharField(max_length=50)
    prix_unitaire = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    stock_minimum = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    actif = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    objects = ProduitQuerySet.as_manager()

    class Meta:
        db_table = "produit"
        ordering = ["nom"]

    def __str__(self):
        return self.nom

    def stock_actuel(self):
        return self.mouvements.aggregate(total=stock_expression())["total"]


class MouvementStock(models.Model):
    class TypeMouvement(models.TextChoices):
        ENTREE = "ENTREE", "Entrée"
        SORTIE = "SORTIE", "Sortie"
        AJUSTEMENT = "AJUSTEMENT", "Ajustement"

    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name="mouvements")
    travail = models.ForeignKey("exploitation.Travail", on_delete=models.SET_NULL, null=True, blank=True, related_name="mouvements_stock")
    bloc = models.ForeignKey(Bloc, on_delete=models.SET_NULL, null=True, blank=True, related_name="mouvements_stock")
    type_mouvement = models.CharField(max_length=15, choices=TypeMouvement.choices)
    # Toujours positive pour ENTREE/SORTIE ; signée pour un AJUSTEMENT
    quantite = models.DecimalField(max_digits=15, decimal_places=3)
    prix_unitaire = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    date_mouvement = models.DateField()
    motif = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    observation = models.TextField(blank=True)

    class Meta:
        db_table = "mouvement_stock"
        ordering = ["-date_mouvement", "-id"]
        indexes = [
            models.Index(fields=["produit", "date_mouvement"], name="idx_stock_produit_date"),
            models.Index(fields=["bloc", "date_mouvement"], name="idx_stock_bloc_date"),
        ]

    @property
    def quantite_signee(self):
        return -self.quantite if self.type_mouvement == self.TypeMouvement.SORTIE else self.quantite
