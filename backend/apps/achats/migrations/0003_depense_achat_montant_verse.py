from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def aligner_depenses(apps, schema_editor):
    """La dépense d'un achat ne porte plus le montant total mais ce qui a été versé au vendeur (statut Avance / Payée)."""
    AchatParticulier = apps.get_model('achats', 'AchatParticulier')
    Depense = apps.get_model('finances', 'Depense')
    for achat in AchatParticulier.objects.exclude(depense=None).select_related('depense'):
        paye = achat.paiements.aggregate(total=Sum('montant'))['total'] or Decimal('0')
        depense = achat.depense
        if paye <= 0:
            AchatParticulier.objects.filter(pk=achat.pk).update(depense=None)
            Depense.objects.filter(pk=depense.pk).delete()
            continue
        Depense.objects.filter(pk=depense.pk).update(
            quantite=1, unite='', prix_unitaire=paye, montant_total=paye,
            statut='PAYEE' if paye >= achat.montant_total else 'AVANCE')


class Migration(migrations.Migration):
    dependencies = [
        ('achats', '0002_alignement_frontend'),
        ('finances', '0008_statuts_depenses_avance_payee'),
    ]
    operations = [migrations.RunPython(aligner_depenses, migrations.RunPython.noop)]
