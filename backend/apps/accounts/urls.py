from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'utilisateurs', views.UtilisateurViewSet, basename='utilisateur')
router.register(r'roles', views.RoleViewSet, basename='role')
router.register(r'journal', views.JournalViewSet, basename='journal')

# Monté sous /api/v1/auth/
auth_urlpatterns = [
    path('login/', views.LoginView.as_view()),
    path('logout/', views.LogoutView.as_view()),
    path('refresh/', views.RefreshView.as_view()),
    path('me/', views.MeView.as_view()),
    path('mot-de-passe/', views.ChangementMotDePasseView.as_view()),
]

# Monté sous /api/v1/
urlpatterns = [
    path('', include(router.urls)),
]
