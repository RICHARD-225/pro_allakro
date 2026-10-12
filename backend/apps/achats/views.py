from django.db import transaction
from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.audit import BaseViewSet, CodePreviewMixin, log_action

from .models import AchatParticulier, Particulier
from .serializers import AchatParticulierSerializer, PaiementAchatSerializer, ParticulierSerializer

ZERO = Value(0, output_field=DecimalField(max_digits=15, decimal_places=2))


class ParticulierViewSet(BaseViewSet):
    queryset = Particulier.objects.annotate(
        nb_achats=Count('achats'),
        total_achats=Coalesce(Sum('achats__montant_total'), ZERO),
    ).order_by('nom', 'prenom')
    serializer_class = ParticulierSerializer
    audit_label = 'Particulier'


class AchatParticulierViewSet(CodePreviewMixin, BaseViewSet):
    serializer_class = AchatParticulierSerializer
    perimetre_lookup = 'campement_id'
    audit_label = 'Achat particulier'
    filter_map = {
        'bloc_id': 'bloc_id',
        'campement_id': 'campement_id',
        'particulier_id': 'particulier_id',
    }
    periode_field = 'date_achat'
    search_fields = ('reference', 'particulier__nom', 'particulier__prenom', 'particulier__telephone', 'designation')
    ordering_fields = {'particulier_nom': ('particulier__nom', 'particulier__prenom'), 'montant_total': 'montant_total',
                       'date_achat': 'date_achat', 'designation': 'designation', 'poids': 'poids'}
    totaux_agregats = {
        'nombre': Count('id'),
        'total': Sum('montant_total'),
        'reste': Sum(F('montant_total') - F('montant_paye')),
        'kg': Sum('poids', filter=Q(unite_poids='kg')),
        'vendeurs': Count('particulier', distinct=True),
    }

    def get_queryset(self):
        # Sous-requête pour la somme des paiements (évite tout double comptage)
        from django.db.models import OuterRef, Subquery
        from .models import PaiementAchat

        paye = PaiementAchat.objects.filter(achat=OuterRef('pk')).values('achat').annotate(t=Sum('montant')).values('t')
        self.queryset = AchatParticulier.objects.select_related('particulier', 'bloc', 'campement').annotate(
            montant_paye=Coalesce(Subquery(paye, output_field=DecimalField(max_digits=15, decimal_places=2)), ZERO),
        )
        queryset = super().get_queryset()
        statut = self.request.query_params.get('statut')
        if statut:
            conditions = {'NON_PAYEE': Q(montant_paye__lte=0), 'PAYEE': Q(montant_paye__gte=F('montant_total'), montant_paye__gt=0),
                          'PARTIELLE': Q(montant_paye__gt=0, montant_paye__lt=F('montant_total'))}
            if statut not in conditions:
                raise serializers.ValidationError({'statut': 'Statut inconnu.'})
            queryset = queryset.filter(conditions[statut])
        return queryset

    def describe(self, instance):
        return f"{instance.reference} — {instance.designation} ({instance.montant_total} FCFA)"

    @transaction.atomic
    def perform_destroy(self, instance):
        # Supprime aussi les paiements et la dépense liée
        self.verifier_cloture(instance.date_achat, *instance.paiements.values_list('date_paiement', flat=True))
        depense = instance.depense
        details = self.describe(instance)
        instance.paiements.all().delete()
        instance.delete()
        if depense:
            depense.delete()
        log_action(self.request, 'Suppression', self.audit_label, None, details)

    @action(detail=True, methods=['get'])
    def recu(self, request, pk=None):
        """Reçu PDF de l'achat (vendeur, quantité, prix, montant, règlements)."""
        from apps.finances.recus import recu_achat
        from apps.finances.views import reponse_pdf

        achat = self.get_object()
        log_action(request, 'Consultation', 'Reçu', achat, f"Reçu de l'achat {achat.reference}")
        return reponse_pdf(recu_achat(achat, request.user), f"Recu_{achat.reference}.pdf")

    @action(detail=True, methods=['post'])
    def payer(self, request, pk=None):
        achat = self.get_object()
        serializer = PaiementAchatSerializer(data=request.data, context={'achat': achat})
        serializer.is_valid(raise_exception=True)
        paiement = serializer.save()
        log_action(request, 'Paiement', 'Achat particulier', achat,
                   f"{paiement.montant} FCFA versés pour {achat.reference}")
        return Response(self.get_serializer(self.get_queryset().get(pk=achat.pk)).data, status=status.HTTP_201_CREATED)
