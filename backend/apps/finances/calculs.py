"""Calculs financiers : soldes des rémunérations, statuts de paiement, réalisé des prévisions."""
from decimal import Decimal

from django.db.models import DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce

ZERO = Decimal('0')
ZERO_VALUE = Value(ZERO, output_field=DecimalField(max_digits=15, decimal_places=2))


def statut_paiement(total, paye):
    """NON_PAYEE / PARTIELLE / PAYEE à partir du montant dû et du montant payé."""
    if paye <= 0:
        return 'NON_PAYEE'
    if paye >= total:
        return 'PAYEE'
    return 'PARTIELLE'


def annoter_salaires(queryset):
    return queryset.annotate(
        montant_paye=Coalesce(Sum('paiements__montant'), ZERO_VALUE),
        date_dernier_paiement=Max('paiements__date_paiement'),
    )


def montant_paye_salaire(salaire):
    if hasattr(salaire, 'montant_paye'):
        return salaire.montant_paye
    return salaire.paiements.aggregate(total=Sum('montant'))['total'] or ZERO


def realise_prevision(prevision):
    """Somme des dépenses de la même catégorie, du même campement (et bloc) sur la période."""
    from .models import Depense

    filtre = Q(campement_id=prevision.campement_id, date_depense__range=(prevision.periode_debut, prevision.periode_fin))
    if prevision.categorie_id:
        filtre &= Q(categorie_id=prevision.categorie_id)
    if prevision.bloc_id:
        filtre &= Q(bloc_id=prevision.bloc_id)
    return Depense.objects.filter(filtre).aggregate(total=Sum('montant_total'))['total'] or ZERO
