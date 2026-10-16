from django.db import transaction
from django.db.models import Count, Q
from rest_framework import serializers

from apps.accounts.audit import BaseViewSet, CodePreviewMixin, log_action

from .models import MouvementStock, Produit
from .serializers import MouvementStockSerializer, ProduitSerializer


class ProduitViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Produit.objects.avec_stock().order_by('nom')
    serializer_class = ProduitSerializer
    audit_label = 'Produit'

    @transaction.atomic
    def perform_destroy(self, instance):
        """Supprime le produit avec tous ses mouvements (le Super admin a confirmé) ; la suppression est tracée au journal."""
        mouvements = instance.mouvements.count()
        if mouvements:
            instance.mouvements.all().delete()
            log_action(self.request, 'Suppression', 'Mouvement de stock', None,
                       f"{mouvements} mouvement(s) supprimé(s) avec le produit {instance.nom} ({instance.code})")
        super().perform_destroy(instance)


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
    search_fields = ('produit__nom', 'produit__code', 'motif', 'reference', 'bloc__code', 'bloc__campement__nom')
    ordering_fields = {'produit_nom': 'produit__nom', 'quantite': 'quantite', 'date': 'date_mouvement'}
    totaux_agregats = {
        'nombre': Count('id'),
        'entrees': Count('id', filter=Q(type_mouvement='ENTREE')),
        'sorties': Count('id', filter=Q(type_mouvement='SORTIE')),
        'ajustements': Count('id', filter=Q(type_mouvement='AJUSTEMENT')),
    }

    def perimetre(self, queryset, ids):
        # Un mouvement rattaché à un bloc relève du campement de ce bloc ; sans bloc, il est commun
        return queryset.filter(Q(bloc__campement_id__in=ids) | Q(bloc__isnull=True))

    def describe(self, instance):
        return f"{instance.get_type_mouvement_display()} {instance.quantite} {instance.produit.unite} — {instance.produit.nom}"

    @transaction.atomic
    def perform_destroy(self, instance):
        """Supprime un mouvement après confirmation ; le stock est recalculé (la confirmation annonce le nouveau stock)."""
        produit = Produit.objects.select_for_update().get(pk=instance.produit_id)
        avant = produit.stock_actuel()
        apres = avant - instance.quantite_signee
        super().perform_destroy(instance)
        from apps.accounts.notifications import alerte_stock
        alerte_stock(produit, avant, apres, self.request.user)
        if apres < 0:
            log_action(self.request, 'Modification', 'Produit', produit,
                       f"Stock de {produit.nom} négatif ({apres} {produit.unite}) après suppression d'un mouvement : à corriger par un ajustement")
