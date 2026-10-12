"""
Paiements des rémunérations (salaires) :
- un paiement ne dépasse jamais le reste à payer (rémunération verrouillée pendant l'enregistrement) ;
- le bénéficiaire est la personne seule, le chef d'équipe ou un membre de l'équipe du travail ;
- chaque paiement crée sa dépense (catégorie « Salaires et rémunérations »), une seule, tenue à jour.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from . import clotures
from .models import CategorieDepense, Depense, PaiementSalaire, Salaire

ZERO = Decimal('0')


def montant_paye(salaire, exclure=None):
    # Un paiement annulé ne compte plus
    paiements = PaiementSalaire.objects.filter(salaire=salaire, annule=False)
    if exclure is not None:
        paiements = paiements.exclude(pk=exclure.pk)
    return paiements.aggregate(total=Sum('montant'))['total'] or ZERO


def participants_actuels(salaire):
    """Personnes concernées par la rémunération : participants actuels du travail, ou la personne rémunérée."""
    if salaire.travail_id:
        return [p.personne for p in salaire.travail.participants_actuels()]
    return [salaire.personne]


def beneficiaires_possibles(salaire):
    """Le chef / la personne seule en premier, puis les autres membres."""
    personnes = participants_actuels(salaire)
    personnes.sort(key=lambda p: (p.pk != salaire.personne_id, p.nom, p.prenom))
    return personnes


def verifier_paiement(salaire, montant, beneficiaire, exclure=None, verifier_beneficiaire=True):
    """Erreurs (par champ) d'un paiement sur une rémunération déjà verrouillée."""
    if salaire.est_annulee:
        raise serializers.ValidationError({'detail': ["Cette rémunération est annulée : elle ne peut pas être payée."]})
    reste = salaire.montant_net - montant_paye(salaire, exclure=exclure)
    if montant > reste:
        raise serializers.ValidationError({'montant': [f"Dépasse le reste à payer ({reste.normalize():f} FCFA)."]})
    if verifier_beneficiaire and beneficiaire is not None and \
            beneficiaire.pk not in {p.pk for p in beneficiaires_possibles(salaire)}:
        raise serializers.ValidationError({'beneficiaire_id': [
            f"{beneficiaire.nom_complet} n'est pas concerné(e) par cette rémunération."]})


@transaction.atomic
def enregistrer_paiement(salaire, montant, date_paiement, type_paiement, beneficiaire=None, reference='', observation='',
                         est_avance=False, groupe='', equipe=None):
    # Verrou : deux paiements simultanés ne peuvent pas dépasser le montant dû
    salaire = Salaire.objects.select_for_update(of=('self',)).select_related('personne', 'travail__type_travail', 'bloc').get(pk=salaire.pk)
    clotures.verifier_ouverte(date_paiement, salaire.date_debut)
    beneficiaire = beneficiaire or salaire.personne
    verifier_paiement(salaire, montant, beneficiaire)
    paiement = PaiementSalaire.objects.create(
        salaire=salaire, montant=montant, date_paiement=date_paiement, type_paiement=type_paiement,
        beneficiaire=beneficiaire, reference=reference, observation=observation, est_avance=est_avance,
        groupe=groupe, equipe=equipe or (salaire.travail.equipe if salaire.travail_id else None),
    )
    synchroniser_depense(paiement)
    actualiser_statuts_depenses(salaire)
    return paiement


@transaction.atomic
def modifier_paiement(paiement, **valeurs):
    """Met à jour un paiement (montant, date, mode, bénéficiaire…) et sa dépense ; le reste à payer reste respecté."""
    if paiement.annule:
        raise serializers.ValidationError({'detail': 'Ce paiement est annulé : il ne se modifie plus.'})
    salaire = Salaire.objects.select_for_update(of=('self',)).select_related('personne', 'travail').get(pk=paiement.salaire_id)
    clotures.verifier_ouverte(paiement.date_paiement, valeurs.get('date_paiement'), salaire.date_debut)
    change_beneficiaire = 'beneficiaire' in valeurs and getattr(valeurs['beneficiaire'], 'pk', None) != paiement.beneficiaire_id
    for champ, valeur in valeurs.items():
        setattr(paiement, champ, valeur)
    # Un bénéficiaire inchangé reste valable même s'il a quitté l'équipe depuis (historique)
    verifier_paiement(salaire, paiement.montant, paiement.beneficiaire, exclure=paiement,
                      verifier_beneficiaire=change_beneficiaire)
    paiement.save()
    synchroniser_depense(paiement)
    actualiser_statuts_depenses(salaire)
    return paiement


@transaction.atomic
def annuler_paiement(paiement, motif=''):
    """
    Annule un paiement sans effacer l'historique : il garde son numéro et son reçu (marqué « annulé »), mais ne compte
    plus dans le payé, le reste à payer ni les totaux ; sa dépense automatique est supprimée.
    """
    paiement = PaiementSalaire.objects.select_for_update(of=('self',)).select_related('depense', 'salaire').get(pk=paiement.pk)
    if paiement.annule:
        raise serializers.ValidationError({'detail': 'Ce paiement est déjà annulé.'})
    clotures.verifier_ouverte(paiement.date_paiement, paiement.salaire.date_debut)
    depense = paiement.depense
    paiement.annule = True
    paiement.date_annulation = timezone.now()
    paiement.motif_annulation = (motif or '').strip()[:255]
    paiement.depense = None
    paiement.save(update_fields=['annule', 'date_annulation', 'motif_annulation', 'depense'])
    if depense is not None:
        depense.delete()
    actualiser_statuts_depenses(paiement.salaire)
    return paiement


@transaction.atomic
def reactiver_paiement(paiement):
    """
    Remet en vigueur un paiement annulé : il compte de nouveau (payé, reste, totaux) et sa dépense est recréée.
    Refusé si la rémunération est annulée (la rétablir d'abord) ou si le reste à payer ne suffit plus.
    """
    paiement = PaiementSalaire.objects.select_for_update(of=('self',)).select_related('salaire').get(pk=paiement.pk)
    if not paiement.annule:
        raise serializers.ValidationError({'detail': "Ce paiement n'est pas annulé."})
    salaire = Salaire.objects.select_for_update(of=('self',)).select_related('personne', 'travail').get(pk=paiement.salaire_id)
    clotures.verifier_ouverte(paiement.date_paiement, salaire.date_debut)
    verifier_paiement(salaire, paiement.montant, paiement.beneficiaire, exclure=paiement, verifier_beneficiaire=False)
    paiement.annule = False
    paiement.date_annulation = None
    paiement.motif_annulation = ''
    paiement.save(update_fields=['annule', 'date_annulation', 'motif_annulation'])
    synchroniser_depense(paiement)
    actualiser_statuts_depenses(salaire)
    return paiement


@transaction.atomic
def supprimer_paiement(paiement):
    salaire = paiement.salaire
    clotures.verifier_ouverte(paiement.date_paiement, salaire.date_debut)
    depense = paiement.depense
    paiement.delete()
    if depense:
        depense.delete()
    actualiser_statuts_depenses(salaire)


def actualiser_statuts_depenses(salaire):
    """
    Statut des dépenses des paiements d'une rémunération : la dépense d'une avance reste « Avance » tant que la
    rémunération n'est pas soldée, puis passe à « Payée » ; les autres paiements sont « Payée ».
    """
    soldee = salaire.montant_net - montant_paye(salaire) <= ZERO
    for paiement in PaiementSalaire.objects.filter(salaire=salaire, annule=False, depense__isnull=False).select_related('depense'):
        statut = Depense.Statut.AVANCE if paiement.est_avance and not soldee else Depense.Statut.PAYEE
        if paiement.depense.statut != statut:
            Depense.objects.filter(pk=paiement.depense_id).update(statut=statut)


def synchroniser_depense(paiement):
    """La dépense liée reflète toujours le paiement : montant, date, bénéficiaire, travail, référence."""
    salaire = paiement.salaire
    beneficiaire = paiement.beneficiaire or salaire.personne
    bloc = salaire.bloc or beneficiaire.bloc
    campement_id = bloc.campement_id if bloc else (beneficiaire.campement_id or salaire.personne.campement_id)
    nature = 'Avance' if paiement.est_avance else 'Salaire'
    valeurs = {
        'categorie': CategorieDepense.salaires(),
        'bloc': bloc,
        'campement_id': campement_id,
        'date_depense': paiement.date_paiement,
        'designation': f"{nature} — {salaire.libelle or 'Rémunération'} — {beneficiaire.nom_complet} ({paiement.numero})"[:255],
        'quantite': Decimal('1'),
        'unite': '',
        'prix_unitaire': paiement.montant,
        'montant_total': paiement.montant,
        'statut': Depense.Statut.AVANCE if paiement.est_avance else Depense.Statut.PAYEE,
        'numero_justificatif': paiement.numero,
    }
    if paiement.depense_id:
        depense = paiement.depense
        for champ, valeur in valeurs.items():
            setattr(depense, champ, valeur)
        depense.save()
    else:
        depense = Depense.objects.create(**valeurs)
        PaiementSalaire.objects.filter(pk=paiement.pk).update(depense=depense)
        paiement.depense = depense
    return depense
