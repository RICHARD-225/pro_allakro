from django.db import transaction
from django.db.models import Count, DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status
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
    audit_label = 'Achat particulier'
    filter_map = {
        'bloc_id': 'bloc_id',
        'campement_id': 'campement_id',
        'particulier_id': 'particulier_id',
    }
    periode_field = 'date_achat'

    def get_queryset(self):
        # Sous-requête pour la somme des paiements (évite tout double comptage)
        from django.db.models import OuterRef, Subquery
        from .models import PaiementAchat

        paye = PaiementAchat.objects.filter(achat=OuterRef('pk')).values('achat').annotate(t=Sum('montant')).values('t')
        self.queryset = AchatParticulier.objects.select_related('particulier', 'bloc', 'campement').annotate(
            montant_paye=Coalesce(Subquery(paye, output_field=DecimalField(max_digits=15, decimal_places=2)), ZERO),
        )
        return super().get_queryset()

    def describe(self, instance):
        return f"{instance.reference} — {instance.designation} ({instance.montant_total} FCFA)"

    @transaction.atomic
    def perform_destroy(self, instance):
        # Supprime aussi les paiements et la dépense liée
        depense = instance.depense
        details = self.describe(instance)
        instance.paiements.all().delete()
        instance.delete()
        if depense:
            depense.delete()
        log_action(self.request, 'Suppression', self.audit_label, None, details)

    @action(detail=True, methods=['post'])
    def payer(self, request, pk=None):
        achat = self.get_object()
        serializer = PaiementAchatSerializer(data=request.data, context={'achat': achat})
        serializer.is_valid(raise_exception=True)
        paiement = serializer.save()
        log_action(request, 'Paiement', 'Achat particulier', achat,
                   f"{paiement.montant} FCFA versés pour {achat.reference}")
        return Response(self.get_serializer(self.get_queryset().get(pk=achat.pk)).data, status=status.HTTP_201_CREATED)
