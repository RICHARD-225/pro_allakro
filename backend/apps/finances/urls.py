from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .rapports import RapportView
from .tableau_de_bord import TableauDeBordView
from .views import (
    CategorieDepenseViewSet, DepenseViewSet, PaiementSalaireViewSet, PrevisionViewSet, SalaireViewSet,
)

router = DefaultRouter()
router.register(r'categories-depenses', CategorieDepenseViewSet, basename='categorie-depense')
router.register(r'depenses', DepenseViewSet, basename='depense')
router.register(r'salaires', SalaireViewSet, basename='salaire')
router.register(r'paiements-salaire', PaiementSalaireViewSet, basename='paiement-salaire')
router.register(r'previsions', PrevisionViewSet, basename='prevision')

urlpatterns = [
    path('tableau-de-bord/', TableauDeBordView.as_view(), name='tableau-de-bord'),
    path('rapport/', RapportView.as_view(), name='rapport'),
    path('', include(router.urls)),
]
