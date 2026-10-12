"""Indicateurs du tableau de bord et du bilan mensuel, calculés en base."""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.achats.models import AchatParticulier
from apps.accounts.permissions import forcer_perimetre
from apps.core.models import Bloc, Campement
from apps.core.utils import parse_periode, periode_of, shift_periode
from apps.exploitation.models import Travail
from apps.stock.models import Produit

from .models import Depense, PaiementSalaire, Salaire
from .views import filtre_perimetre_salaires


def salaires_du_mois(debut, fin, campement_id=None, bloc_id=None):
    """Rémunérations du mois (hors annulées) sur le périmètre : bloc du travail ou de la personne."""
    salaires = Salaire.objects.filter(date_debut__range=(debut, fin), annulee=False).exclude(travail__statut='ANNULE')
    return filtre_perimetre_salaires(salaires, bloc_id, campement_id)

MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']


def somme(queryset, champ):
    return float(queryset.aggregate(total=Sum(champ))['total'] or 0)


def periodes_disponibles():
    """Mois pour lesquels il existe des données, du plus récent au plus ancien."""
    mois = set()
    for model, champ in ((Depense, 'date_depense'), (Travail, 'date_travail'),
                         (Salaire, 'date_debut'), (AchatParticulier, 'date_achat')):
        mois.update(model.objects.annotate(m=TruncMonth(champ)).values_list('m', flat=True).distinct())
    return sorted({periode_of(m) for m in mois if m}, reverse=True)


class TableauDeBordView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        Travail.objects.rafraichir_statuts()
        params = request.query_params
        periodes = periodes_disponibles()
        periode = params.get('periode') or (periodes[0] if periodes else None)
        if periode is None:
            from django.utils import timezone
            periode = timezone.localdate().strftime('%Y-%m')
        try:
            debut, fin = parse_periode(periode)
        except Exception:
            raise serializers.ValidationError({'periode': 'Période invalide (format attendu : AAAA-MM).'})

        campement_id, bloc_id = forcer_perimetre(request, params.get('campement_id'), params.get('bloc_id'))
        for nom, valeur in (('campement_id', campement_id), ('bloc_id', bloc_id)):
            if valeur and not valeur.isdigit():
                raise serializers.ValidationError({nom: 'Identifiant invalide.'})

        return Response(construire_tableau(periode, periodes, campement_id, bloc_id))


def construire_tableau(periode, periodes, campement_id, bloc_id):
    """Indicateurs d'un mois (et du périmètre demandé) : utilisés par l'écran, le bilan et la clôture mensuelle."""
    debut, fin = parse_periode(periode)
    # Périmètre (campement / bloc) appliqué à chaque type de donnée
    def perimetre(qs, bloc_lookup='bloc_id', campement_lookup='campement_id'):
        if bloc_id:
            return qs.filter(**{bloc_lookup: bloc_id})
        if campement_id:
            return qs.filter(**{campement_lookup: campement_id})
        return qs

    depenses = perimetre(Depense.objects.all())
    depenses_mois = depenses.filter(date_depense__range=(debut, fin))
    total_depenses = somme(depenses_mois, 'montant_total')
    prec_debut, prec_fin = parse_periode(shift_periode(periode, -1))
    total_precedent = somme(depenses.filter(date_depense__range=(prec_debut, prec_fin)), 'montant_total')
    evolution = round((total_depenses - total_precedent) / total_precedent * 100) if total_precedent else 0
    depenses_payees = somme(depenses_mois.filter(statut='PAYEE'), 'montant_total')

    par_categorie = [
        {'name': row['categorie__libelle'], 'value': float(row['total'])}
        for row in depenses_mois.values('categorie__libelle').annotate(total=Sum('montant_total')).order_by('-total')
        if row['total']
    ]

    # Par bloc (avec son campement) et par activité : un salaire payé se rattache à l'activité de son travail,
    # toute autre dépense est « Hors travaux »
    par_bloc = []
    for row in depenses_mois.values('bloc__code', 'bloc__nom', 'bloc__campement__nom').annotate(total=Sum('montant_total')).order_by('-total'):
        if row['total']:
            par_bloc.append({
                'name': f"{row['bloc__code']} — {row['bloc__nom']}" if row['bloc__code'] else 'Sans bloc',
                'campement': row['bloc__campement__nom'], 'value': float(row['total']),
            })
    par_activite_totaux = {}
    for depense in depenses_mois.select_related('paiement_salaire__salaire__travail__type_travail'):
        paiement = getattr(depense, 'paiement_salaire', None)
        travail = paiement.salaire.travail if paiement is not None else None
        nom = travail.activite_libelle if travail is not None else 'Hors travaux'
        par_activite_totaux[nom] = par_activite_totaux.get(nom, Decimal('0')) + depense.montant_total
    par_activite = [{'name': nom, 'value': float(total)}
                    for nom, total in sorted(par_activite_totaux.items(), key=lambda x: -x[1]) if total]

    campements = Campement.objects.filter(actif=True).select_related('responsable')
    if campement_id:
        campements = campements.filter(pk=campement_id)
    filtre_dep = Q(depenses__date_depense__range=(debut, fin))
    if bloc_id:
        filtre_dep &= Q(depenses__bloc_id=bloc_id)
    par_campement = [
        {'name': c.nom.replace('Campement ', ''), 'label': c.nom, 'value': float(c.total or 0),
         'responsable': c.responsable.nom_complet if c.responsable_id else None}
        for c in campements.annotate(total=Sum('depenses__montant_total', filter=filtre_dep))
    ]

    debut_6_mois, _ = parse_periode(shift_periode(periode, -5))
    totaux_mois = {
        periode_of(row['m']): float(row['total'] or 0)
        for row in depenses.filter(date_depense__range=(debut_6_mois, fin))
        .annotate(m=TruncMonth('date_depense')).values('m').annotate(total=Sum('montant_total'))
    }
    evolution_data = []
    for decalage in range(-5, 1):
        p = shift_periode(periode, decalage)
        evolution_data.append({'month': MOIS_COURTS[int(p[5:7]) - 1], 'periode': p, 'total': totaux_mois.get(p, 0)})

    # Rémunérations de la période (travaux et rémunérations manuelles du périmètre)
    salaires = salaires_du_mois(debut, fin, campement_id, bloc_id)
    remuneration_due = somme(salaires, 'montant_net')
    remuneration_payee = somme(PaiementSalaire.objects.filter(salaire__in=salaires, annule=False), 'montant')
    reste_a_payer = max(remuneration_due - remuneration_payee, 0)

    travaux = perimetre(Travail.objects.exclude(statut='ANNULE'), campement_lookup='bloc__campement_id') \
        .filter(date_travail__range=(debut, fin))
    # Montant des travaux par activité (les unités diffèrent d'une activité à l'autre : on compare des FCFA)
    travaux_par_type = [
        {'name': row['type_travail__libelle'], 'value': float(row['total'] or 0)}
        for row in travaux.values('type_travail__libelle').annotate(total=Sum('montant_total')).order_by('-total')
    ]

    achats = perimetre(AchatParticulier.objects.filter(date_achat__range=(debut, fin)))

    produits = list(Produit.objects.filter(actif=True).avec_stock())
    alertes = [
        {'id': p.pk, 'nom': p.nom, 'code': p.code, 'unite': p.unite,
         'stock_calcule': float(p.stock_calcule), 'stock_minimum': float(p.stock_minimum)}
        for p in produits if p.stock_calcule < p.stock_minimum
    ]

    blocs = perimetre(Bloc.objects.filter(actif=True), bloc_lookup='pk')

    return ({
        'periode': periode,
        'periodes': periodes,
        'kpis': {
            'totalDepenses': total_depenses,
            'depensesEvolution': evolution,
            'depensesPayees': depenses_payees,
            # Dépenses encore au statut « Avance » (avance non soldée) ; l'ancien nom est conservé pour compatibilité
            'depensesAvances': total_depenses - depenses_payees,
            'depensesEnAttente': total_depenses - depenses_payees,
            'remunerationDuee': remuneration_due,
            'remunerationPayee': remuneration_payee,
            'resteAPayer': reste_a_payer,
            'tauxPaiement': round(remuneration_payee / remuneration_due * 100) if remuneration_due else 0,
            'nbTravaux': travaux.count(),
            'montantTravaux': somme(travaux, 'montant_total'),
            'quantiteTotale': somme(travaux.filter(unite='ha'), 'quantite'),
            'stockDisponible': float(sum((p.stock_calcule for p in produits), Decimal('0'))),
            'valeurStock': float(sum((p.stock_calcule * p.prix_unitaire for p in produits), Decimal('0'))),
            'achatsParticuliers': somme(achats, 'montant_total'),
            'nbAchats': achats.count(),
            'blocsActifs': blocs.count(),
        },
        'depensesParCategorie': par_categorie,
        'depensesParCampement': par_campement,
        'depensesParBloc': par_bloc,
        'depensesParActivite': par_activite,
        'depensesEvolutionData': evolution_data,
        'remunerationData': [
            {'name': 'Dû', 'value': remuneration_due},
            {'name': 'Payé', 'value': remuneration_payee},
            {'name': 'Reste', 'value': reste_a_payer},
        ],
        'travauxData': travaux_par_type,
        'stockAlerts': alertes,
    })
