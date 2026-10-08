"""Indicateurs du tableau de bord et du bilan mensuel, calculés en base."""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.achats.models import AchatParticulier
from apps.core.models import Bloc, Campement
from apps.core.utils import parse_periode, periode_of, shift_periode
from apps.exploitation.models import Travail
from apps.stock.models import Produit

from .models import Depense, PaiementSalaire, Prevision, Salaire
from .views import personnes_du_bloc

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

        campement_id, bloc_id = params.get('campement_id'), params.get('bloc_id')
        for nom, valeur in (('campement_id', campement_id), ('bloc_id', bloc_id)):
            if valeur and not valeur.isdigit():
                raise serializers.ValidationError({nom: 'Identifiant invalide.'})

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

        campements = Campement.objects.filter(actif=True)
        if campement_id:
            campements = campements.filter(pk=campement_id)
        filtre_dep = Q(depenses__date_depense__range=(debut, fin))
        if bloc_id:
            filtre_dep &= Q(depenses__bloc_id=bloc_id)
        par_campement = [
            {'name': c.nom.replace('Campement ', ''), 'value': float(c.total or 0)}
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

        # Rémunérations de la période (personnes du périmètre)
        salaires = Salaire.objects.filter(date_debut=debut)
        if bloc_id:
            salaires = salaires.filter(personne_id__in=personnes_du_bloc(bloc_id))
        elif campement_id:
            salaires = salaires.filter(personne__campement_id=campement_id)
        remuneration_due = somme(salaires, 'montant_net')
        remuneration_payee = somme(PaiementSalaire.objects.filter(salaire__in=salaires), 'montant')
        reste_a_payer = max(remuneration_due - remuneration_payee, 0)

        travaux = perimetre(Travail.objects.exclude(statut='ANNULE'), campement_lookup='bloc__campement_id') \
            .filter(date_travail__range=(debut, fin))
        travaux_par_type = [
            {'name': row['type_travail__libelle'], 'value': float(row['total'] or 0)}
            for row in travaux.filter(unite='ha').values('type_travail__libelle').annotate(total=Sum('quantite')).order_by('-total')
        ]

        achats = perimetre(AchatParticulier.objects.filter(date_achat__range=(debut, fin)))

        produits = list(Produit.objects.filter(actif=True).avec_stock())
        alertes = [
            {'id': p.pk, 'nom': p.nom, 'code': p.code, 'unite': p.unite,
             'stock_calcule': float(p.stock_calcule), 'stock_minimum': float(p.stock_minimum)}
            for p in produits if p.stock_calcule < p.stock_minimum
        ]

        blocs = perimetre(Bloc.objects.filter(actif=True), bloc_lookup='pk')

        previsions = perimetre(Prevision.objects.filter(periode_debut=debut))
        realise_par_categorie = {
            row['categorie_id']: float(row['total'] or 0)
            for row in depenses_mois.values('categorie_id').annotate(total=Sum('montant_total'))
        }
        previsions_data = [
            {'name': row['categorie__libelle'] or 'Sans catégorie', 'Prévu': float(row['prevu']),
             'Réalisé': realise_par_categorie.get(row['categorie_id'], 0),
             'Écart': realise_par_categorie.get(row['categorie_id'], 0) - float(row['prevu'])}
            for row in previsions.values('categorie_id', 'categorie__libelle').annotate(prevu=Sum('montant_prevu'))
        ]

        return Response({
            'periode': periode,
            'periodes': periodes,
            'kpis': {
                'totalDepenses': total_depenses,
                'depensesEvolution': evolution,
                'depensesPayees': depenses_payees,
                'depensesEnAttente': total_depenses - depenses_payees,
                'remunerationDuee': remuneration_due,
                'remunerationPayee': remuneration_payee,
                'resteAPayer': reste_a_payer,
                'tauxPaiement': round(remuneration_payee / remuneration_due * 100) if remuneration_due else 0,
                'nbTravaux': travaux.count(),
                'quantiteTotale': somme(travaux.filter(unite='ha'), 'quantite'),
                'stockDisponible': float(sum((p.stock_calcule for p in produits), Decimal('0'))),
                'achatsParticuliers': somme(achats, 'montant_total'),
                'nbAchats': achats.count(),
                'blocsActifs': blocs.count(),
            },
            'depensesParCategorie': par_categorie,
            'depensesParCampement': par_campement,
            'depensesEvolutionData': evolution_data,
            'remunerationData': [
                {'name': 'Dû', 'value': remuneration_due},
                {'name': 'Payé', 'value': remuneration_payee},
                {'name': 'Reste', 'value': reste_a_payer},
            ],
            'previsionsData': previsions_data,
            'travauxData': travaux_par_type,
            'stockAlerts': alertes,
        })
