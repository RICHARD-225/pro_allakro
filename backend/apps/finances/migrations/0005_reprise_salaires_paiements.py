"""
Reprise des données :
- catégorie système « Salaires et rémunérations » ;
- rémunérations existantes : bloc de la personne et libellé du mois ;
- paiements existants : numéro PAY-…, bénéficiaire (la personne rémunérée) et dépense correspondante (une seule).
"""
from django.db import migrations

MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
        'Septembre', 'Octobre', 'Novembre', 'Décembre']


def reprendre(apps, schema_editor):
    Bloc = apps.get_model('core', 'Bloc')
    CategorieDepense = apps.get_model('finances', 'CategorieDepense')
    Depense = apps.get_model('finances', 'Depense')
    Salaire = apps.get_model('finances', 'Salaire')
    PaiementSalaire = apps.get_model('finances', 'PaiementSalaire')

    categorie, _ = CategorieDepense.objects.get_or_create(
        code='CAT-SAL', defaults={'libelle': 'Salaires et rémunérations', 'actif': True})
    campements = dict(Bloc.objects.values_list('id', 'campement_id'))

    for salaire in Salaire.objects.select_related('personne'):
        salaire.bloc_id = salaire.bloc_id or salaire.personne.bloc_id
        if not salaire.libelle:
            salaire.libelle = f"Rémunération {MOIS[salaire.date_debut.month - 1]} {salaire.date_debut.year}"
        salaire.save(update_fields=['bloc', 'libelle'])

    numero = 1
    for paiement in PaiementSalaire.objects.select_related('salaire__personne').order_by('date_paiement', 'id'):
        salaire, personne = paiement.salaire, paiement.salaire.personne
        if not paiement.numero:
            paiement.numero = f"PAY-{numero:05d}"
            numero += 1
        paiement.beneficiaire_id = paiement.beneficiaire_id or personne.pk
        bloc_id = salaire.bloc_id or personne.bloc_id
        campement_id = campements.get(bloc_id) or personne.campement_id
        if paiement.depense_id is None and campement_id:
            depense = Depense.objects.create(
                categorie=categorie, bloc_id=bloc_id, campement_id=campement_id, date_depense=paiement.date_paiement,
                designation=f"Salaire — {salaire.libelle} — {personne.prenom} {personne.nom} ({paiement.numero})"[:255],
                quantite=1, unite='', prix_unitaire=paiement.montant, montant_total=paiement.montant, statut='PAYEE',
                numero_justificatif=paiement.numero,
            )
            paiement.depense_id = depense.pk
        paiement.save(update_fields=['numero', 'beneficiaire', 'depense'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_reprise_personnes_fonctions'),
        ('exploitation', '0004_reprise_activites_travaux'),
        ('finances', '0004_salaires_paiements_travaux'),
    ]

    operations = [
        migrations.RunPython(reprendre, migrations.RunPython.noop),
    ]
