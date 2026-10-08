from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.audit import BaseViewSet, CodePreviewMixin

from . import services
from .models import AffectationEquipeBloc, Bloc, Campement, Fonction, MembreEquipe, Plantation
from .serializers import (
    BlocSerializer, CampementSerializer, EquipeSerializer, FonctionSerializer,
    PersonneSerializer, PlantationSerializer,
)


class PlantationViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Plantation.objects.annotate(nb_campements=Count('campements')).order_by('nom')
    serializer_class = PlantationSerializer
    audit_label = 'Plantation'


class CampementViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Campement.objects.select_related('plantation', 'responsable').annotate(nb_blocs=Count('blocs')).order_by('nom')
    serializer_class = CampementSerializer
    audit_label = 'Campement'
    filter_map = {'plantation_id': 'plantation_id'}


class BlocViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Bloc.objects.select_related('campement')
    serializer_class = BlocSerializer
    audit_label = 'Bloc'
    filter_map = {'campement_id': 'campement_id'}


class FonctionViewSet(BaseViewSet):
    queryset = Fonction.objects.all()
    serializer_class = FonctionSerializer
    audit_label = 'Fonction'


class PersonneViewSet(CodePreviewMixin, BaseViewSet):
    serializer_class = PersonneSerializer
    audit_label = 'Personne'
    filter_map = {'campement_id': 'campement_id'}

    def get_queryset(self):
        self.queryset = services.personnes_queryset()
        queryset = super().get_queryset()
        params = self.request.query_params
        if params.get('equipe_id'):
            queryset = queryset.filter(participations_equipes__equipe_id=params['equipe_id'],
                                       participations_equipes__date_fin__isnull=True)
        if params.get('bloc_id'):
            queryset = queryset.filter(
                participations_equipes__date_fin__isnull=True,
                participations_equipes__equipe__affectations_blocs__date_fin__isnull=True,
                participations_equipes__equipe__affectations_blocs__bloc_id=params['bloc_id'],
            )
        return queryset.distinct()

    def describe(self, instance):
        return f"{instance.nom_complet} ({instance.matricule})"


class EquipeViewSet(CodePreviewMixin, BaseViewSet):
    serializer_class = EquipeSerializer
    audit_label = 'Équipe'

    def get_queryset(self):
        self.queryset = services.equipes_queryset()
        queryset = super().get_queryset()
        params = self.request.query_params
        affectation_en_cours = Q(affectations_blocs__date_fin__isnull=True)
        if params.get('bloc_id'):
            queryset = queryset.filter(affectation_en_cours, affectations_blocs__bloc_id=params['bloc_id'])
        elif params.get('campement_id'):
            queryset = queryset.filter(affectation_en_cours, affectations_blocs__bloc__campement_id=params['campement_id'])
        return queryset.distinct()


class MembreEquipeViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des appartenances (modifié uniquement via les équipes et les personnes)."""

    permission_classes = [IsAuthenticated]
    queryset = MembreEquipe.objects.select_related('personne', 'equipe')

    def get_serializer_class(self):
        from rest_framework import serializers

        class MembreEquipeSerializer(serializers.ModelSerializer):
            class Meta:
                model = MembreEquipe
                fields = ['id', 'personne_id', 'equipe_id', 'date_debut', 'date_fin', 'role_dans_equipe']

        return MembreEquipeSerializer


class AffectationEquipeBlocViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des affectations équipe → bloc (modifié uniquement via les équipes)."""

    permission_classes = [IsAuthenticated]
    queryset = AffectationEquipeBloc.objects.select_related('bloc', 'equipe')

    def get_serializer_class(self):
        from rest_framework import serializers

        class AffectationSerializer(serializers.ModelSerializer):
            class Meta:
                model = AffectationEquipeBloc
                fields = ['id', 'equipe_id', 'bloc_id', 'date_debut', 'date_fin', 'responsable']

        return AffectationSerializer
