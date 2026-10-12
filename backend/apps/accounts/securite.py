"""Journal des événements de sécurité et gestion des erreurs de l'API (aucun détail technique n'est jamais renvoyé au client)."""
import logging

from rest_framework import exceptions
from rest_framework.views import exception_handler

journal = logging.getLogger('allakro.securite')


def adresse(request):
    from .audit import client_ip
    return client_ip(request) or '?'


def evenement(request, message, niveau=logging.WARNING):
    """Écrit un événement de sécurité : utilisateur (si connu), adresse IP, méthode et chemin."""
    user = getattr(request, 'user', None)
    nom = getattr(user, 'username', None) if getattr(user, 'is_authenticated', False) else '-'
    journal.log(niveau, '%s | utilisateur=%s ip=%s %s %s', message, nom, adresse(request), request.method, request.path)


def gestionnaire_exceptions(exc, contexte):
    """Réponse d'erreur standard de DRF ; les refus (401 / 403 / 429) sont tracés dans le journal de sécurité."""
    reponse = exception_handler(exc, contexte)
    request = contexte.get('request')
    if reponse is not None and request is not None:
        if isinstance(exc, exceptions.PermissionDenied):
            evenement(request, 'Accès refusé (403)')
        elif isinstance(exc, exceptions.Throttled):
            evenement(request, 'Trop de requêtes (429)')
        elif isinstance(exc, exceptions.NotAuthenticated) or isinstance(exc, exceptions.AuthenticationFailed):
            evenement(request, 'Authentification refusée (401)', logging.INFO)
    return reponse
