from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.audit import log_action
from apps.accounts.permissions import forcer_perimetre

from .classeur import XLSX, generer_classeur
from .perimetre import Perimetre


class RapportView(APIView):
    """GET /rapport/?periode=AAAA-MM&campement_id=&bloc_id= → rapport de gestion Excel (une feuille par thème)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'rapport'

    def get(self, request):
        campement_id, bloc_id = forcer_perimetre(request, request.query_params.get('campement_id'), request.query_params.get('bloc_id'))
        perimetre = Perimetre(request.query_params.get('periode'), campement_id, bloc_id)
        response = HttpResponse(generer_classeur(perimetre, request.user), content_type=XLSX)
        response['Content-Disposition'] = f'attachment; filename="{perimetre.nom_fichier}"'
        log_action(request, 'Consultation', 'Rapport', None,
                   f"Rapport Excel — {perimetre.libelle_periode} — {perimetre.libelle_perimetre}")
        return response
