from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounts.audit import log_action

from .classeur import XLSX, generer_classeur
from .perimetre import Perimetre


class RapportView(APIView):
    """GET /rapport/?periode=AAAA-MM&campement_id=&bloc_id= → rapport de gestion Excel (une feuille par thème)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        perimetre = Perimetre.depuis_parametres(request.query_params)
        response = HttpResponse(generer_classeur(perimetre, request.user), content_type=XLSX)
        response['Content-Disposition'] = f'attachment; filename="{perimetre.nom_fichier}"'
        log_action(request, 'Consultation', 'Rapport', None,
                   f"Rapport Excel — {perimetre.libelle_periode} — {perimetre.libelle_perimetre}")
        return response
