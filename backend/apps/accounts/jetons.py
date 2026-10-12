"""
Jetons de session (JWT) : émission, révocation et contrôle.

- Chaque utilisateur a une `token_version` ; elle est copiée dans ses jetons et incrémentée quand toutes ses sessions doivent
  cesser (changement de mot de passe, de rôle, désactivation, réutilisation d'un jeton déjà révoqué).
- Un jeton précis se révoque en inscrivant son identifiant (`jti`) : déconnexion, rotation du jeton de rafraîchissement.
"""
from datetime import datetime, timezone as fuseau_utc

from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import JetonRevoque


def emettre(utilisateur):
    """Retourne (jeton de rafraîchissement, jeton d'accès) sous forme de chaînes."""
    refresh = RefreshToken()
    refresh['user_id'] = utilisateur.pk
    refresh['username'] = utilisateur.username
    refresh['tv'] = utilisateur.token_version
    return str(refresh), str(refresh.access_token)


def lire(brut, classe):
    """Jeton valide (signature, expiration, type) ou None."""
    if not brut:
        return None
    try:
        return classe(brut)
    except TokenError:
        return None


def lire_refresh(brut):
    return lire(brut, RefreshToken)


def lire_acces(brut):
    return lire(brut, AccessToken)


def est_revoque(jeton):
    return JetonRevoque.objects.filter(jti=jeton['jti']).exists()


def revoquer(jeton):
    if jeton is None:
        return
    JetonRevoque.objects.get_or_create(
        jti=jeton['jti'], defaults={'expire_le': datetime.fromtimestamp(jeton['exp'], tz=fuseau_utc.utc)})
    # Nettoyage des jetons déjà expirés (ils seraient refusés de toute façon)
    JetonRevoque.objects.filter(expire_le__lt=timezone.now()).delete()


def invalider_sessions(utilisateur):
    """Toutes les sessions ouvertes du compte cessent de valoir."""
    utilisateur.token_version += 1
    utilisateur.save(update_fields=['token_version'])
