"""
Protection CSRF de l'API.

L'authentification repose sur des cookies : un site tiers pourrait donc faire envoyer une requête par le navigateur d'un
utilisateur connecté. Toute requête qui modifie des données (POST, PATCH, PUT, DELETE) doit présenter le jeton CSRF :
cookie « csrftoken » (posé par GET /api/v1/auth/csrf/) renvoyé dans l'en-tête X-CSRFToken, et une origine autorisée.
Django exempte par défaut les vues DRF ; ce middleware lève cette exemption pour tout le chemin /api/.
"""
from django.http import JsonResponse
from django.middleware.csrf import CsrfViewMiddleware

from .securite import evenement


def _vue_sans_exemption(request, *args, **kwargs):  # pragma: no cover - jamais appelée, sert de cible au contrôle
    return None


class CsrfApiMiddleware(CsrfViewMiddleware):
    def process_view(self, request, callback, callback_args, callback_kwargs):
        if request.path.startswith('/api/'):
            callback = _vue_sans_exemption  # ignore @csrf_exempt posé par DRF
        return super().process_view(request, callback, callback_args, callback_kwargs)

    def _reject(self, request, reason):
        evenement(request, f'Requête CSRF refusée ({reason})')
        return JsonResponse({'detail': 'Requête refusée par la protection CSRF. Rechargez la page puis réessayez.',
                             'code': 'csrf'}, status=403)
