from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AffectationEquipeBlocViewSet, BlocViewSet, CampementViewSet, EquipeViewSet, FonctionViewSet,
    MembreEquipeViewSet, PersonneViewSet, PlantationViewSet, UnitesView,
)

router = DefaultRouter()
router.register(r'plantations', PlantationViewSet, basename='plantation')
router.register(r'campements', CampementViewSet, basename='campement')
router.register(r'blocs', BlocViewSet, basename='bloc')
router.register(r'personnes', PersonneViewSet, basename='personne')
router.register(r'fonctions', FonctionViewSet, basename='fonction')
router.register(r'equipes', EquipeViewSet, basename='equipe')
router.register(r'membres-equipe', MembreEquipeViewSet, basename='membre-equipe')
router.register(r'affectations', AffectationEquipeBlocViewSet, basename='affectation')

urlpatterns = [
    path('unites/', UnitesView.as_view(), name='unites'),
    path('', include(router.urls)),
]
