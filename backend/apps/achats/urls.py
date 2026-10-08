from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AchatParticulierViewSet, ParticulierViewSet

router = DefaultRouter()
router.register(r'particuliers', ParticulierViewSet, basename='particulier')
router.register(r'achats-particuliers', AchatParticulierViewSet, basename='achat-particulier')

urlpatterns = [
    path('', include(router.urls)),
]
