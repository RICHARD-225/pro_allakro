from django.conf import settings
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Utilisateur


class CustomJWTAuthentication(JWTAuthentication):
    """
    JWT lu dans l'en-tête Authorization ou, à défaut, dans le cookie httpOnly `allakro_access`.
    L'utilisateur est un `Utilisateur` de l'application (et non le User de django.contrib.auth).
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
        return self.get_user(validated_token), validated_token

    def get_user(self, validated_token):
        user_id = validated_token.get('user_id')
        if user_id is None:
            raise exceptions.AuthenticationFailed('Jeton invalide.', code='token_not_valid')
        try:
            user = Utilisateur.objects.select_related('role', 'personne').get(pk=user_id)
        except Utilisateur.DoesNotExist:
            raise exceptions.AuthenticationFailed('Utilisateur introuvable.', code='user_not_found')
        if not user.actif:
            raise exceptions.AuthenticationFailed('Ce compte est désactivé.', code='user_inactive')
        return user
