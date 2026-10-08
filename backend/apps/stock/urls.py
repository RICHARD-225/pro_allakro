from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MouvementStockViewSet, ProduitViewSet

router = DefaultRouter()
router.register(r'produits', ProduitViewSet, basename='produit')
router.register(r'mouvements-stock', MouvementStockViewSet, basename='mouvement-stock')

urlpatterns = [
    path('', include(router.urls)),
]
