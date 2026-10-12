"""Filtre d'entrée : les caractères que PostgreSQL ne peut pas stocker ou comparer sont refusés dès l'entrée (400) au lieu de produire une erreur 500."""
from urllib.parse import unquote

from django.http import JsonResponse


class EntreesSainesMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        brut = request.META.get('QUERY_STRING', '') + request.path
        if '\x00' in unquote(brut) or '\x00' in brut:
            return JsonResponse({'detail': 'Requête invalide : caractère interdit dans l\'adresse.'}, status=400)
        return self.get_response(request)
