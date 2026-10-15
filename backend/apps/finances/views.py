from decimal import Decimal

from django.db import transaction
from django.db.models import BooleanField, Case, Count, DecimalField, F, OuterRef, Prefetch, Q, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from rest_framework import exceptions, serializers, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.audit import BaseViewSet, CodePreviewMixin, log_action
from apps.accounts.notifications import destinataires, notifier, notifier_big_boss
from apps.core.utils import ids_campements
from apps.core.validators import libelle_periode
from apps.exploitation.models import Travail, TravailParticipant

from . import clotures, paiements
from .models import CategorieDepense, ClotureMensuelle, Depense, PaiementSalaire, Salaire
from .serializers import (
    CategorieDepenseSerializer, DepenseSerializer, PaiementLotSerializer, PaiementSalaireSerializer, SalaireSerializer,
)


def salaires_queryset():
    """Rémunérations avec travail, équipe, participants et paiements préchargés (pas de requêtes en boucle)."""
    return Salaire.objects.select_related(
        'personne__campement__plantation', 'bloc__campement__plantation', 'travail__type_travail', 'travail__equipe',
    ).prefetch_related(
        Prefetch('paiements', queryset=PaiementSalaire.objects.select_related('beneficiaire')),
        Prefetch('travail__participants', queryset=TravailParticipant.objects.filter(date_retrait__isnull=True)
                 .select_related('personne'), to_attr='participants_en_cours'),
    )


def filtre_perimetre_salaires(queryset, bloc_id=None, campement_id=None):
    if bloc_id:
        return queryset.filter(bloc_id=bloc_id)
    ids = ids_campements(campement_id)
    if ids:
        return queryset.filter(Q(bloc__campement_id__in=ids) | Q(bloc__isnull=True, personne__campement_id__in=ids))
    return queryset


def reponse_pdf(contenu, nom_fichier):
    response = HttpResponse(contenu, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'
    return response


class CategorieDepenseViewSet(CodePreviewMixin, BaseViewSet):
    big_boss_actions = ('create', 'update', 'partial_update', 'destroy')
    queryset = CategorieDepense.objects.all()
    serializer_class = CategorieDepenseSerializer
    audit_label = 'Catégorie de dépense'

    def perform_destroy(self, instance):
        if instance.systeme:
            raise serializers.ValidationError({'detail': 'Cette catégorie système ne peut pas être supprimée.'})
        super().perform_destroy(instance)


class DepenseViewSet(BaseViewSet):
    queryset = Depense.objects.select_related(
        'categorie', 'bloc', 'campement', 'achat_particulier', 'paiement_salaire__beneficiaire',
        'paiement_salaire__salaire__travail__type_travail',
    )
    serializer_class = DepenseSerializer
    audit_label = 'Dépense'
    ordre_defaut = ('-date_creation', '-id')
    perimetre_lookup = 'campement_id'
    search_fields = ('designation', 'categorie__libelle', 'bloc__code', 'campement__nom', 'numero_justificatif')
    ordering_fields = {'designation': 'designation', 'categorie': 'categorie__libelle', 'date': 'date_depense', 'montant_total': 'montant_total'}
    totaux_agregats = {
        'nombre': Count('id'),
        'total': Sum('montant_total'),
        'payees': Sum('montant_total', filter=Q(statut='PAYEE')),
        'avances': Sum('montant_total', filter=Q(statut='AVANCE')),
    }
    filter_map = {
        'bloc_id': 'bloc_id',
        'campement_id': 'campement_id',
        'categorie_id': 'categorie_id',
        'statut': 'statut',
    }
    periode_field = 'date_depense'

    def describe(self, instance):
        return f"{instance.designation} ({instance.montant_total} FCFA)"

    def _refuser_si_liee(self, instance):
        if getattr(instance, 'achat_particulier', None):
            raise serializers.ValidationError({'detail': (
                "Cette dépense provient d'un achat particulier : modifiez ou supprimez l'achat lui-même.")})
        if getattr(instance, 'paiement_salaire', None):
            raise serializers.ValidationError({'detail': (
                "Cette dépense provient d'un paiement de salaire : modifiez ou supprimez le paiement depuis Salaires.")})

    def perform_update(self, serializer):
        self._refuser_si_liee(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._refuser_si_liee(instance)
        super().perform_destroy(instance)


class SalaireViewSet(BaseViewSet):
    """
    Section SALAIRES : rémunérations générées par les travaux et rémunérations manuelles.
    Aucune modification directe (ni PUT ni PATCH) : le montant d'une rémunération vient du travail, ou se corrige
    par annulation puis nouvelle saisie ; les paiements restent la seule trace des sommes versées.
    """

    serializer_class = SalaireSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    audit_label = 'Rémunération'
    ordre_defaut = ('-date_creation', '-id')
    filter_map = {'travail_id': 'travail_id'}

    periode_field = 'date_debut'
    search_fields = ('libelle', 'personne__nom', 'personne__prenom', 'personne__matricule', 'bloc__code', 'bloc__campement__nom')
    ordering_fields = {'libelle': 'libelle', 'personne_nom': ('personne__nom', 'personne__prenom'), 'date_debut': 'date_debut',
                       'montant_du': 'montant_net', 'reste': 'reste_sql'}
    # Indicateurs de la page : rémunérations non annulées de la sélection (toutes les lignes filtrées, pas seulement la page)
    totaux_agregats = {
        'du': Sum('montant_net', filter=Q(annulee_sql=False)),
        'paye': Sum('paye_sql', filter=Q(annulee_sql=False)),
        'reste': Sum(Case(When(reste_sql__gt=0, then=F('reste_sql')), default=Value(0), output_field=DecimalField()), filter=Q(annulee_sql=False)),
        'a_payer': Count('id', filter=Q(annulee_sql=False, reste_sql__gt=0)),
        'nombre': Count('id'),
    }

    def perimetre(self, queryset, ids):
        return queryset.filter(Q(bloc__campement_id__in=ids) | Q(bloc__isnull=True, personne__campement_id__in=ids))

    @staticmethod
    def annoter(queryset):
        """Montant payé (paiements valides), reste et état « annulée » calculés en SQL : filtre par statut, tri et totaux côté serveur."""
        paye = PaiementSalaire.objects.filter(salaire=OuterRef('pk'), annule=False).values('salaire').annotate(t=Sum('montant')).values('t')
        return queryset.annotate(
            paye_sql=Coalesce(Subquery(paye, output_field=DecimalField()), Value(Decimal('0')), output_field=DecimalField()),
        ).annotate(
            reste_sql=F('montant_net') - F('paye_sql'),
            annulee_sql=Case(When(Q(annulee=True) | Q(travail__statut='ANNULE'), then=Value(True)), default=Value(False), output_field=BooleanField()),
        )

    def get_queryset(self):
        self.queryset = self.annoter(salaires_queryset())
        queryset = super().get_queryset()
        params = self.request.query_params
        statut = params.get('statut')
        if statut:
            conditions = {
                'ANNULEE': Q(annulee_sql=True),
                'PAYEE': Q(annulee_sql=False, paye_sql__gte=F('montant_net'), paye_sql__gt=0),
                'PARTIELLE': Q(annulee_sql=False, paye_sql__gt=0, reste_sql__gt=0),
                'NON_PAYEE': Q(annulee_sql=False, paye_sql__lte=0),
            }
            if statut not in conditions:
                raise serializers.ValidationError({'statut': 'Statut inconnu.'})
            queryset = queryset.filter(conditions[statut])
        if params.get('a_payer'):
            # Rémunérations qui peuvent encore être payées (fenêtre « Nouveau paiement »)
            queryset = queryset.filter(annulee_sql=False, reste_sql__gt=0)
        for nom in ('bloc_id', 'campement_id', 'personne_id'):
            if params.get(nom) and not params[nom].isdigit():
                raise serializers.ValidationError({nom: 'Identifiant invalide.'})
        queryset = filtre_perimetre_salaires(queryset, params.get('bloc_id'), params.get('campement_id'))
        if params.get('personne_id'):
            # La personne rémunérée, ou un membre de l'équipe du travail
            queryset = queryset.filter(Q(personne_id=params['personne_id']) | Q(
                travail__participants__personne_id=params['personne_id'],
                travail__participants__date_retrait__isnull=True)).distinct()
        if params.get('origine') == 'TRAVAIL':
            queryset = queryset.filter(travail__isnull=False)
        elif params.get('origine') == 'MANUELLE':
            queryset = queryset.filter(travail__isnull=True)
        return queryset

    def list(self, request, *args, **kwargs):
        Travail.objects.rafraichir_statuts()
        return super().list(request, *args, **kwargs)

    def describe(self, instance):
        return f"{instance.libelle or 'Rémunération'} — {instance.personne.nom_complet} ({instance.montant_net} FCFA net)"

    def perform_destroy(self, instance):
        if instance.travail_id:
            raise serializers.ValidationError({'detail': (
                "Cette rémunération provient d'un travail : supprimez ou annulez le travail.")})
        if instance.paiements.exists():
            raise serializers.ValidationError({'detail': 'Cette rémunération a déjà des paiements : elle ne peut pas être supprimée.'})
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        salaire = self.get_object()
        if salaire.travail_id:
            raise serializers.ValidationError({'detail': "Pour annuler cette rémunération, annulez le travail correspondant."})
        if salaire.paiements.filter(annule=False).exists():
            raise serializers.ValidationError({'detail': (
                'Cette rémunération a des paiements : annulez-les d\'abord, puis annulez la rémunération.')})
        Salaire.objects.filter(pk=salaire.pk).update(annulee=True)
        log_action(request, 'Modification', self.audit_label, salaire, f"{self.describe(salaire)} : annulée")
        return Response(self.get_serializer(self.get_queryset().get(pk=salaire.pk)).data)

    @action(detail=True, methods=['post'])
    def retablir(self, request, pk=None):
        salaire = self.get_object()
        Salaire.objects.filter(pk=salaire.pk).update(annulee=False)
        log_action(request, 'Modification', self.audit_label, salaire, f"{self.describe(salaire)} : rétablie")
        return Response(self.get_serializer(self.get_queryset().get(pk=salaire.pk)).data)


class PaiementSalaireViewSet(BaseViewSet):
    """Paiements des rémunérations : un paiement crée sa dépense et son reçu ; il se corrige (journal) ou se supprime (Big Boss)."""

    serializer_class = PaiementSalaireSerializer
    audit_label = 'Paiement'
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
    filter_map = {
        'salaire_id': 'salaire_id',
        'travail_id': 'salaire__travail_id',
        'equipe_id': 'equipe_id',
        'bloc_id': 'salaire__bloc_id',
        'campement_id': 'salaire__bloc__campement_id',
    }
    periode_field = 'date_paiement'

    search_fields = ('numero', 'beneficiaire__nom', 'beneficiaire__prenom', 'salaire__personne__nom', 'salaire__personne__prenom',
                     'salaire__libelle', 'salaire__travail__type_travail__libelle', 'salaire__travail__equipe__nom', 'salaire__bloc__code')
    ordering_fields = {'numero': 'numero', 'date': 'date_paiement', 'beneficiaire_nom': ('beneficiaire__nom', 'beneficiaire__prenom'),
                       'montant': 'montant'}
    totaux_agregats = {
        'valides': Count('id', filter=Q(annule=False)),
        'annules': Count('id', filter=Q(annule=True)),
        'montant': Sum('montant', filter=Q(annule=False)),
    }

    def get_queryset(self):
        self.queryset = PaiementSalaire.objects.select_related(
            'beneficiaire', 'salaire__personne__campement', 'salaire__bloc__campement', 'salaire__travail__type_travail',
            'salaire__travail__equipe', 'equipe',
        ).prefetch_related('salaire__paiements')
        queryset = super().get_queryset()
        personne_id = self.request.query_params.get('personne_id')
        if personne_id:
            if not personne_id.isdigit():
                raise serializers.ValidationError({'personne_id': 'Identifiant invalide.'})
            queryset = queryset.filter(Q(beneficiaire_id=personne_id) | Q(salaire__personne_id=personne_id))
        mode = self.request.query_params.get('mode')
        if mode == 'EQUIPE':
            queryset = queryset.filter(salaire__travail__equipe__isnull=False)
        elif mode == 'INDIVIDUEL':
            queryset = queryset.filter(Q(salaire__travail__isnull=True) | Q(salaire__travail__equipe__isnull=True))
        return queryset

    def describe(self, instance):
        beneficiaire = instance.beneficiaire or instance.salaire.personne
        return f"{instance.numero} : {instance.montant} FCFA à {beneficiaire.nom_complet} ({instance.salaire.libelle})"

    def perimetre(self, queryset, ids):
        return queryset.filter(Q(salaire__bloc__campement_id__in=ids) | Q(salaire__bloc__isnull=True, salaire__personne__campement_id__in=ids))

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save()
            self.verifier_perimetre(serializer.instance)
        log_action(self.request, 'Paiement', self.audit_label, serializer.instance, self.describe(serializer.instance))

    def perform_update(self, serializer):
        avant = f"{serializer.instance.montant} FCFA le {serializer.instance.date_paiement:%d/%m/%Y}"
        with transaction.atomic():
            serializer.save()
            self.verifier_perimetre(serializer.instance)
        log_action(self.request, 'Modification', self.audit_label, serializer.instance,
                   f"{self.describe(serializer.instance)} (avant : {avant})")

    def perform_destroy(self, instance):
        details = self.describe(instance)
        paiements.supprimer_paiement(instance)
        log_action(self.request, 'Suppression', self.audit_label, None, details)

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        """Annule un paiement (il reste dans l'historique, marqué annulé) ; sa dépense disparaît, le reste à payer remonte."""
        paiement = self.get_object()
        motif = str(request.data.get('motif', '') or '')
        paiement = paiements.annuler_paiement(paiement, motif)
        log_action(request, 'Annulation', self.audit_label, paiement,
                   f"{self.describe(paiement)} : annulé{f' ({paiement.motif_annulation})' if paiement.motif_annulation else ''}")
        notifier_big_boss('annulation', f'Paiement {paiement.numero} annulé', f'{paiement.montant:,.0f} FCFA, par {request.user.nom_complet}.'.replace(',', ' '),
                          '/salaires?onglet=paiements', auteur=request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=paiement.pk)).data)

    @action(detail=True, methods=['post'])
    def reactiver(self, request, pk=None):
        """Remet en vigueur un paiement annulé (il compte de nouveau, sa dépense est recréée)."""
        paiement = paiements.reactiver_paiement(self.get_object())
        log_action(request, 'Modification', self.audit_label, paiement, f"{self.describe(paiement)} : réactivé")
        return Response(self.get_serializer(self.get_queryset().get(pk=paiement.pk)).data)

    @action(detail=False, methods=['post'])
    def lot(self, request):
        """Nouveau paiement : plusieurs rémunérations payées ensemble au même bénéficiaire."""
        serializer = PaiementLotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            crees = serializer.save()
            for cree in crees:
                self.verifier_perimetre(cree)
        total = sum(p.montant for p in crees)
        log_action(request, 'Paiement', self.audit_label, crees[0],
                   f"{len(crees)} paiement(s) — {total} FCFA à {serializer.validated_data['beneficiaire_id'].nom_complet}")
        data = PaiementSalaireSerializer(self.get_queryset().filter(pk__in=[p.pk for p in crees]), many=True).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def recu(self, request, pk=None):
        """Reçu PDF du paiement."""
        from .recus import recu_paiement

        paiement = self.get_object()
        log_action(request, 'Consultation', 'Reçu', paiement, f"Reçu du paiement {paiement.numero}")
        return reponse_pdf(recu_paiement(paiement, request.user), f"Recu_{paiement.numero}.pdf")


class ClotureView(APIView):
    """GET : mois clôturés (le résumé chiffré n'est montré qu'au Big Boss) ; POST {periode, commentaire} : clôturer (Big Boss)."""

    permission_classes = [IsAuthenticated]

    @staticmethod
    def representer(cloture, avec_resume):
        donnees = {'periode': cloture.periode, 'cloturee': cloture.cloturee, 'date_cloture': cloture.date_cloture,
                   'cloturee_par': cloture.cloturee_par.nom_complet if cloture.cloturee_par_id else None,
                   'commentaire': cloture.commentaire, 'date_reouverture': cloture.date_reouverture,
                   'reouverte_par': cloture.reouverte_par.nom_complet if cloture.reouverte_par_id else None}
        if avec_resume:
            donnees['kpis'] = cloture.resume.get('kpis', {})
        return donnees

    def get(self, request):
        clotures_ = ClotureMensuelle.objects.select_related('cloturee_par__personne', 'reouverte_par__personne')
        return Response([self.representer(c, request.user.is_big_boss) for c in clotures_])

    def post(self, request):
        if not request.user.is_big_boss:
            raise exceptions.PermissionDenied('Action réservée au Big Boss.')
        cloture = clotures.cloturer(str(request.data.get('periode', '')), request.user, request.data.get('commentaire', ''))
        log_action(request, 'Clôture', 'Clôture mensuelle', None, f"Mois {cloture.periode} clôturé")
        notifier(destinataires(exclure=request.user), 'cloture', f'Mois clôturé : {libelle_periode(cloture.periode)}',
                 "Les données de ce mois ne peuvent plus être modifiées.", '/bilan')
        return Response(self.representer(cloture, True), status=status.HTTP_201_CREATED)


class ClotureRouvrirView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, periode):
        if not request.user.is_big_boss:
            raise exceptions.PermissionDenied('Action réservée au Big Boss.')
        cloture = clotures.rouvrir(periode, request.user)
        log_action(request, 'Réouverture', 'Clôture mensuelle', None, f"Mois {cloture.periode} rouvert")
        notifier(destinataires(exclure=request.user), 'cloture', f'Mois rouvert : {libelle_periode(cloture.periode)}',
                 f'Rouvert par {request.user.nom_complet}.', '/bilan')
        return Response(ClotureView.representer(cloture, True))
