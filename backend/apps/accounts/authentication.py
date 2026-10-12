from django.conf import settings
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from . import jetons
from .models import Utilisateur


class CustomJWTAuthentication(JWTAuthentication):
    """
    JWT lu dans l'en-tête Authorization ou, à défaut, dans le cookie httpOnly `allakro_access`.
    L'utilisateur est un `Utilisateur` de l'application (et non le User de django.contrib.auth).
    Un jeton est refusé s'il a été révoqué (déconnexion) ou si la version de session du compte a changé
    (mot de passe, rôle ou état du compte modifié).
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            raw_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE']) or None
        else:
            raw_token = self.get_raw_token(header)

        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        if jetons.est_revoque(validated_token):
            raise exceptions.AuthenticationFailed('Session terminée, reconnectez-vous.', code='token_not_valid')
        return self.get_user(validated_token), validated_token

    def get_user(self, validated_token):
        user_id = validated_token.get('user_id')
        if user_id is None:
            raise exceptions.AuthenticationFailed('Jeton invalide.', code='token_not_valid')
        try:
            user = Utilisateur.objects.select_related('role', 'personne__bloc').get(pk=user_id)
        except Utilisateur.DoesNotExist:
            raise exceptions.AuthenticationFailed('Utilisateur introuvable.', code='user_not_found')
        if not user.actif:
            raise exceptions.AuthenticationFailed('Ce compte est désactivé.', code='user_inactive')
        if validated_token.get('tv') != user.token_version:
            raise exceptions.AuthenticationFailed('Session expirée, reconnectez-vous.', code='token_not_valid')
        return user
