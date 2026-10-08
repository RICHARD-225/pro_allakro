from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .audit import BaseViewSet, log_action
from .models import Journal, RoleUtilisateur, Utilisateur
from .permissions import IsBigBoss
from .serializers import (
    ChangementMotDePasseSerializer, JournalSerializer, LoginSerializer, MeSerializer, RoleSerializer, UtilisateurSerializer,
)


def get_tokens_for_user(user):
    refresh = RefreshToken()
    refresh['user_id'] = user.id
    refresh['username'] = user.username
    return str(refresh), str(refresh.access_token)


def set_auth_cookies(response, access=None, refresh=None):
    jwt = settings.SIMPLE_JWT
    options = {'httponly': True, 'secure': not settings.DEBUG, 'samesite': jwt['AUTH_COOKIE_SAMESITE'], 'path': '/'}
    if access:
        response.set_cookie(jwt['AUTH_COOKIE'], access,
                            max_age=int(jwt['ACCESS_TOKEN_LIFETIME'].total_seconds()), **options)
    if refresh:
        response.set_cookie(jwt['AUTH_COOKIE_REFRESH'], refresh,
                            max_age=int(jwt['REFRESH_TOKEN_LIFETIME'].total_seconds()), **options)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # un cookie expiré ne doit pas bloquer la connexion

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip().lower()
        password = serializer.validated_data['password']

        user = Utilisateur.objects.select_related('role', 'personne').filter(username__iexact=username).first()
        if user is None or not check_password(password, user.password_hash):
            return Response({'detail': 'Identifiant ou mot de passe incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.actif:
            return Response({'detail': 'Ce compte est désactivé. Contactez l’administrateur.'}, status=status.HTTP_403_FORBIDDEN)

        user.derniere_connexion = timezone.now()
        user.save(update_fields=['derniere_connexion'])
        request.user = user
        log_action(request, 'Connexion', 'Authentification', user, f"Connexion de {user.username}")

        refresh, access = get_tokens_for_user(user)
        response = Response(MeSerializer(user).data, status=status.HTTP_200_OK)
        set_auth_cookies(response, access=access, refresh=refresh)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        response = Response({'detail': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
        response.delete_cookie(settings.SIMPLE_JWT['AUTH_COOKIE'], path='/')
        response.delete_cookie(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'], path='/')
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'])
        if refresh_token is None:
            return Response({'detail': 'Session expirée.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(refresh_token)
        except TokenError:
            return Response({'detail': 'Session expirée.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not Utilisateur.objects.filter(pk=refresh.get('user_id'), actif=True).exists():
            return Response({'detail': 'Compte introuvable ou désactivé.'}, status=status.HTTP_401_UNAUTHORIZED)
        response = Response({'detail': 'Session prolongée.'}, status=status.HTTP_200_OK)
        set_auth_cookies(response, access=str(refresh.access_token))
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangementMotDePasseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangementMotDePasseSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_action(request, 'Modification', 'Utilisateur', user, f"Changement de mot de passe de {user.username}")
        return Response({'detail': 'Mot de passe modifié.'})


class UtilisateurViewSet(BaseViewSet):
    queryset = Utilisateur.objects.select_related('personne', 'role')
    serializer_class = UtilisateurSerializer
    permission_classes = [IsAuthenticated, IsBigBoss]
    audit_label = 'Utilisateur'
    http_method_names = ['get', 'post', 'patch', 'head', 'options']


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RoleUtilisateur.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]


class JournalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = JournalSerializer
    permission_classes = [IsAuthenticated, IsBigBoss]

    def get_queryset(self):
        queryset = Journal.objects.select_related('utilisateur__personne')
        action = self.request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)
        return queryset

    def list(self, request, *args, **kwargs):
        # Les 1000 actions les plus récentes
        return Response(self.get_serializer(self.get_queryset()[:1000], many=True).data)
