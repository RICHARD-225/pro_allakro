from django.db import transaction
from rest_framework import serializers

from apps.accounts.audit import BaseViewSet, CodePreviewMixin

from .models import MouvementStock, Produit
from .serializers import MouvementStockSerializer, ProduitSerializer


class ProduitViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Produit.objects.avec_stock().order_by('nom')
    serializer_class = ProduitSerializer
    audit_label = 'Produit'


class MouvementStockViewSet(BaseViewSet):
    """Les mouvements forment un registre : ils ne se modifient pas."""

    queryset = MouvementStock.objects.select_related('produit', 'bloc__campement')
    serializer_class = MouvementStockSerializer
    audit_label = 'Mouvement de stock'
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    filter_map = {
        'produit_id': 'produit_id',
        'bloc_id': 'bloc_id',
        'campement_id': 'bloc__campement_id',
        'type_mouvement': 'type_mouvement',
    }
    periode_field = 'date_mouvement'

    def describe(self, instance):
        return f"{instance.get_type_mouvement_display()} {instance.quantite} {instance.produit.unite} — {instance.produit.nom}"

    @transaction.atomic
    def perform_destroy(self, instance):
        produit = Produit.objects.select_for_update().get(pk=instance.produit_id)
        if produit.stock_actuel() - instance.quantite_signee < 0:
            raise serializers.ValidationError({'detail': (
                "Supprimer ce mouvement rendrait le stock négatif (des sorties en dépendent).")})
        super().perform_destroy(instance)
