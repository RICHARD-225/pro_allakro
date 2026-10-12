"""
Protection des points d'accès d'authentification :
- débit limité par adresse IP (ou par compte connecté) grâce aux « throttles » de DRF ;
- blocage temporaire d'un identifiant ou d'une adresse IP après trop d'échecs de connexion (enregistrés en base).
"""
import math
from datetime import timedelta

from django.utils import timezone
from rest_framework import exceptions
from rest_framework.throttling import ScopedRateThrottle

from .models import TentativeConnexion

FENETRE = timedelta(minutes=15)
# Un même couple (compte, adresse IP) est bloqué après 5 échecs : un tiers ne peut donc pas verrouiller le compte d'autrui
# depuis sa propre adresse. Le compte est bloqué pour toutes les adresses après 30 échecs (attaque répartie), et une adresse
# après 20 échecs sur l'ensemble des comptes.
MAX_ECHECS_COMPTE_ET_IP = 5
MAX_ECHECS_PAR_COMPTE = 30
MAX_ECHECS_PAR_IP = 20
CONSERVATION = timedelta(days=30)


class LimitationDebitMixin:
    """À combiner avec un `throttle_scope` (taux définis dans settings.REST_FRAMEWORK)."""

    throttle_classes = [ScopedRateThrottle]

    def throttled(self, request, wait):
        secondes = max(1, math.ceil(wait or 60))
        raise exceptions.Throttled(wait=secondes, detail=f"Trop de requêtes. Réessayez dans {secondes} seconde(s).")


def _attente(dates, maximum, maintenant):
    """Secondes à attendre : le blocage cesse quand l'échec le plus ancien parmi les `maximum` derniers sort de la fenêtre."""
    if len(dates) < maximum:
        return 0
    return max(0, math.ceil((dates[maximum - 1] + FENETRE - maintenant).total_seconds()))


def _echecs(maximum, depuis, **filtre):
    return list(TentativeConnexion.objects.filter(reussie=False, date__gt=depuis, **filtre)
                .order_by('-date').values_list('date', flat=True)[:maximum])


def delai_avant_tentative(identifiant, adresse_ip):
    """0 si la connexion peut être tentée, sinon le nombre de secondes à attendre."""
    maintenant = timezone.now()
    depuis = maintenant - FENETRE
    derniere_reussite = TentativeConnexion.objects.filter(identifiant=identifiant, reussie=True).values_list('date', flat=True).first()
    depuis_compte = max(depuis, derniere_reussite) if derniere_reussite else depuis
    if adresse_ip:
        attente = _attente(_echecs(MAX_ECHECS_COMPTE_ET_IP, depuis_compte, identifiant=identifiant, adresse_ip=adresse_ip),
                           MAX_ECHECS_COMPTE_ET_IP, maintenant)
        attente = max(attente, _attente(_echecs(MAX_ECHECS_PAR_IP, depuis, adresse_ip=adresse_ip), MAX_ECHECS_PAR_IP, maintenant))
    else:  # adresse inconnue : le compte seul est limité, plus strictement
        attente = _attente(_echecs(MAX_ECHECS_COMPTE_ET_IP, depuis_compte, identifiant=identifiant), MAX_ECHECS_COMPTE_ET_IP, maintenant)
    return max(attente, _attente(_echecs(MAX_ECHECS_PAR_COMPTE, depuis_compte, identifiant=identifiant), MAX_ECHECS_PAR_COMPTE, maintenant))


def debloquer(identifiant):
    """Efface les échecs récents d'un compte (déblocage par le Big Boss) ; retourne le nombre d'échecs effacés."""
    return TentativeConnexion.objects.filter(identifiant=identifiant[:150], reussie=False).delete()[0]


def enregistrer_tentative(identifiant, adresse_ip, reussie):
    TentativeConnexion.objects.create(identifiant=identifiant[:150], adresse_ip=adresse_ip, reussie=reussie)
    if not reussie:
        TentativeConnexion.objects.filter(date__lt=timezone.now() - CONSERVATION).delete()
