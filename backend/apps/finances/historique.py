"""Historique d'une personne : travaux (rôle, équipe), rémunérations (y compris « payé via le chef d'équipe ») et paiements reçus."""
from decimal import Decimal

from django.db.models import Prefetch

from apps.exploitation.models import TravailParticipant

from .calculs import STATUTS_REMUNERATION, libelle_paye_via, paiement_des_participants, statut_remuneration
from .models import PaiementSalaire, Salaire

ZERO = Decimal('0')


def _situation(salaire, versements):
    paye = sum((p.montant for p in versements), ZERO)
    statut = statut_remuneration(salaire, paye)
    return paye, statut


def historique_personne(personne):
    participations = list(TravailParticipant.objects.filter(personne=personne).select_related(
        'travail__type_travail', 'travail__bloc__campement', 'travail__equipe', 'travail__responsable',
    ).order_by('-travail__date_travail', '-date_ajout'))
    salaires = {
        s.travail_id: s for s in Salaire.objects.filter(travail_id__in={p.travail_id for p in participations})
        .select_related('personne').prefetch_related(Prefetch('paiements', queryset=PaiementSalaire.objects.select_related('beneficiaire')))
    }

    travaux = []
    for participation in participations:
        travail = participation.travail
        salaire = salaires.get(travail.pk)
        remuneration = None
        if salaire is not None:
            versements = [p for p in salaire.paiements.all() if not p.annule]
            paye, statut = _situation(salaire, versements)
            ligne = paiement_des_participants(salaire, [participation], versements, statut)[0]
            remuneration = {
                'id': salaire.pk, 'statut': statut, 'statut_libelle': STATUTS_REMUNERATION[statut],
                'montant_du': float(salaire.montant_net), 'montant_paye': float(paye),
                'reste': 0.0 if statut == 'ANNULEE' else float(max(salaire.montant_net - paye, ZERO)),
                'montant_recu': ligne['montant_recu'], 'paye_via_libelle': libelle_paye_via(ligne),
            }
        travaux.append({
            'travail_id': travail.pk, 'activite': travail.activite_libelle, 'bloc_code': travail.bloc.code,
            'campement_nom': travail.bloc.campement.nom, 'date_debut': travail.date_travail, 'date_fin': travail.date_fin,
            'statut_travail': travail.get_statut_display(), 'quantite': float(travail.quantite), 'unite': travail.unite,
            'montant_total': float(travail.montant_total),
            'role': participation.role_lors_du_travail, 'role_libelle': participation.get_role_lors_du_travail_display(),
            'actuel': participation.date_retrait is None, 'date_ajout': participation.date_ajout,
            'date_retrait': participation.date_retrait,
            'equipe_nom': travail.equipe.nom if travail.equipe_id else None,
            'responsable_nom': travail.responsable.nom_complet if travail.responsable_id else None,
            'remuneration': remuneration,
        })

    manuelles = []
    for salaire in Salaire.objects.filter(personne=personne, travail__isnull=True).prefetch_related('paiements').order_by('-date_debut'):
        paye, statut = _situation(salaire, [p for p in salaire.paiements.all() if not p.annule])
        manuelles.append({
            'id': salaire.pk, 'libelle': salaire.libelle, 'periode': salaire.date_debut.strftime('%Y-%m'),
            'montant_du': float(salaire.montant_net), 'montant_paye': float(paye),
            'reste': 0.0 if statut == 'ANNULEE' else float(max(salaire.montant_net - paye, ZERO)),
            'statut': statut, 'statut_libelle': STATUTS_REMUNERATION[statut],
        })

    recus = PaiementSalaire.objects.filter(beneficiaire=personne, annule=False).select_related('salaire').order_by('-date_paiement', '-id')
    paiements_recus = [{
        'id': p.pk, 'numero': p.numero, 'date': p.date_paiement, 'montant': float(p.montant),
        'salaire_libelle': p.salaire.libelle, 'type_paiement': p.type_paiement, 'est_avance': p.est_avance,
        'pour_equipe': p.salaire.personne_id == personne.pk and bool(p.salaire.travail_id and p.equipe_id),
    } for p in recus]

    return {
        'travaux': travaux,
        'remunerations': manuelles,
        'paiements': paiements_recus,
        'total_recu': float(sum((p.montant for p in recus), ZERO)),
    }
