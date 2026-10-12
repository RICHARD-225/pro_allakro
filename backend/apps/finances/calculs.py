"""Calculs financiers : soldes et statuts des rémunérations, paiements via le chef d'équipe."""
from decimal import Decimal

from django.db.models import DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce

ZERO = Decimal('0')
ZERO_VALUE = Value(ZERO, output_field=DecimalField(max_digits=15, decimal_places=2))

STATUTS_REMUNERATION = {
    'NON_PAYEE': 'À payer', 'PARTIELLE': 'Partiellement payé', 'PAYEE': 'Payé', 'ANNULEE': 'Annulé',
}


def statut_paiement(total, paye):
    """NON_PAYEE / PARTIELLE / PAYEE à partir du montant dû et du montant payé."""
    if paye <= 0:
        return 'NON_PAYEE'
    if paye >= total:
        return 'PAYEE'
    return 'PARTIELLE'


def statut_remuneration(salaire, paye):
    """Statut d'une rémunération : ANNULEE si elle (ou son travail) est annulée, sinon selon les paiements."""
    if salaire.est_annulee:
        return 'ANNULEE'
    return statut_paiement(salaire.montant_net, paye)


def situation_au_paiement(paiement):
    """
    Situation de la rémunération juste après ce paiement (celui du reçu) : net, total payé jusque-là (ce paiement
    compris, paiements classés par date puis par numéro d'enregistrement) et reste à payer.
    """
    salaire = paiement.salaire
    cle = (paiement.date_paiement, paiement.pk)
    paye = sum((p.montant for p in salaire.paiements.all() if not p.annule and (p.date_paiement, p.pk) <= cle), ZERO)
    return {'net': salaire.montant_net, 'paye': paye, 'reste': max(salaire.montant_net - paye, ZERO)}


def annoter_salaires(queryset):
    return queryset.annotate(
        montant_paye=Coalesce(Sum('paiements__montant', filter=Q(paiements__annule=False)), ZERO_VALUE),
        date_dernier_paiement=Max('paiements__date_paiement', filter=Q(paiements__annule=False)),
    )


def montant_paye_salaire(salaire):
    if hasattr(salaire, 'montant_paye'):
        return salaire.montant_paye
    return salaire.paiements.filter(annule=False).aggregate(total=Sum('montant'))['total'] or ZERO


def paiement_des_participants(salaire, participants, paiements, statut):
    """
    Situation de chaque participant : payé directement, ou « payé via » le(s) bénéficiaire(s) des paiements
    (le chef d'équipe en général). Les membres qui n'ont rien reçu eux-mêmes sont ainsi tracés.
    """
    chef_id = salaire.personne_id
    beneficiaires = {}
    for paiement in paiements:
        if paiement.beneficiaire_id:
            beneficiaires[paiement.beneficiaire_id] = paiement.beneficiaire
    situation = []
    for participant in participants:
        personne = participant.personne
        ligne = {
            'personne_id': personne.pk, 'nom': personne.nom_complet, 'matricule': personne.matricule,
            'role': participant.role_lors_du_travail, 'statut': statut, 'paye_via': None, 'paye_via_chef': False,
            'montant_recu': float(sum((p.montant for p in paiements if p.beneficiaire_id == personne.pk), ZERO)),
        }
        if statut in ('PAYEE', 'PARTIELLE') and personne.pk not in beneficiaires:
            autres = [b for pk, b in beneficiaires.items() if pk != personne.pk]
            ligne['paye_via'] = ', '.join(b.nom_complet for b in autres)
            ligne['paye_via_chef'] = bool(autres) and all(b.pk == chef_id for b in autres)
        situation.append(ligne)
    return situation


def libelle_paye_via(ligne):
    """« Payé via le chef d'équipe » (ou via le membre bénéficiaire) pour un membre non payé directement."""
    if not ligne['paye_via']:
        return None
    prefixe = 'Payé' if ligne['statut'] == 'PAYEE' else 'Partiellement payé'
    if ligne['paye_via_chef']:
        return f"{prefixe} via le chef d'équipe ({ligne['paye_via']})"
    return f"{prefixe} via {ligne['paye_via']}"
