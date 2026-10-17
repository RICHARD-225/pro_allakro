from decimal import Decimal

from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.audit import BaseViewSet, CodePreviewMixin
from apps.accounts.permissions import IsBigBoss

from . import services
from .models import AffectationEquipeBloc, Bloc, Campement, Equipe, Fonction, MembreEquipe, Plantation
from .serializers import (
    BlocSerializer, CampementSerializer, EquipeSerializer, FonctionSerializer,
    PersonneSerializer, PlantationSerializer,
)
from .unites import UNITE_PAR_DEFAUT, UNITES


def somme_blocs(champ):
    """Sous-requête : somme des superficies des blocs dont `champ` (ex. campement) désigne la ligne courante (0 s'il n'y en a pas)."""
    total = Bloc.objects.filter(**{champ: OuterRef('pk')}).order_by().values(champ).annotate(t=Sum('superficie')).values('t')[:1]
    decimal = DecimalField(max_digits=14, decimal_places=2)
    return Coalesce(Subquery(total, output_field=decimal), Value(Decimal('0')), output_field=decimal)


class PlantationViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Plantation.objects.annotate(
        nb_campements=Count('campements', distinct=True), superficie_calculee=somme_blocs('campement__plantation'),
    ).order_by('nom')
    serializer_class = PlantationSerializer
    audit_label = 'Plantation'
    ordre_defaut = ('-date_creation', '-id')
    # La structure de l'exploitation (plantations, campements) ne se modifie que par le Super admin
    big_boss_actions = ('create', 'update', 'partial_update', 'destroy')

    def perimetre(self, queryset, ids):
        return queryset.filter(pk__in=Campement.objects.filter(pk__in=ids).values('plantation_id'))


class CampementViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Campement.objects.select_related('plantation', 'responsable').annotate(
        nb_blocs=Count('blocs', distinct=True), superficie_calculee=somme_blocs('campement'),
    ).order_by('nom')
    serializer_class = CampementSerializer
    audit_label = 'Campement'
    filter_map = {'plantation_id': 'plantation_id'}
    ordre_defaut = ('-date_creation', '-id')
    big_boss_actions = ('create', 'update', 'partial_update', 'destroy', 'responsables')
    perimetre_lookup = 'pk'

    @action(detail=False, methods=['get'])
    def responsables(self, request):
        """Personnes proposées comme responsables : superviseurs et Super admin actifs, avec les campements qu'ils gèrent déjà."""
        from apps.accounts.models import RoleUtilisateur, Utilisateur
        comptes = Utilisateur.objects.filter(actif=True, role__code__in=(RoleUtilisateur.SUPERVISEUR, RoleUtilisateur.BIG_BOSS))
        donnees = []
        for compte in comptes.select_related('personne', 'role').order_by('personne__nom', 'personne__prenom'):
            p = compte.personne
            campements = list(p.campements_responsable.order_by('nom').values_list('nom', flat=True))
            donnees.append({'id': p.pk, 'prenom': p.prenom, 'nom': p.nom, 'matricule': p.matricule, 'role': compte.role.code,
                            'role_libelle': compte.role.libelle, 'campements': campements})
        return Response(donnees)


class BlocViewSet(CodePreviewMixin, BaseViewSet):
    queryset = Bloc.objects.select_related('campement__plantation').annotate(
        nb_personnes=Count('personnes', filter=Q(personnes__actif=True)),
    ).order_by('code')
    serializer_class = BlocSerializer
    audit_label = 'Bloc'
    filter_map = {'campement_id': 'campement_id'}
    ordre_defaut = ('-date_creation', '-id')
    perimetre_lookup = 'campement_id'
    # Un responsable crée et modifie les blocs de SES campements (contrôlé par le périmètre) ; la suppression reste au Super admin
    big_boss_actions = ('destroy',)

    def describe(self, instance):
        return f"{instance.code} — {instance.nom} ({instance.nombre_plantes} plantes)"


class FonctionViewSet(BaseViewSet):
    queryset = Fonction.objects.annotate(
        nb_personnes=Count('personnes', filter=Q(personnes__date_fin__isnull=True, personnes__principal=True)),
    ).order_by('libelle')
    serializer_class = FonctionSerializer
    audit_label = 'Fonction'

    def create(self, request, *args, **kwargs):
        # Une fonction déjà connue (majuscules et espaces ignorés) est renvoyée au lieu d'être créée une seconde fois
        existante = services.fonction_existante(request.data.get('libelle', ''))
        if existante:
            return Response(FonctionSerializer(existante).data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)


class PersonneViewSet(CodePreviewMixin, BaseViewSet):
    serializer_class = PersonneSerializer
    audit_label = 'Personne'
    filter_map = {'campement_id': 'campement_id', 'bloc_id': 'bloc_id'}
    ordre_defaut = ('-date_creation', '-id')
    search_fields = ('matricule', 'nom', 'prenom', 'telephone', 'bloc__code', 'campement__nom', 'fonctions__fonction__libelle')
    ordering_fields = {'nom': ('nom', 'prenom'), 'fonction_libelle': 'fonctions__fonction__libelle', 'bloc_code': 'bloc__code',
                       'campement_nom': 'campement__nom', 'date_embauche': 'date_embauche'}
    totaux_agregats = {'nombre': Count('id', distinct=True), 'actifs': Count('id', filter=Q(actif=True), distinct=True)}

    def perimetre(self, queryset, ids):
        return queryset.filter(Q(bloc__campement_id__in=ids) | Q(bloc__isnull=True, campement_id__in=ids))

    def get_queryset(self):
        self.queryset = services.personnes_queryset()
        queryset = super().get_queryset()
        params = self.request.query_params
        actif = params.get('actif')
        if actif in ('true', 'false'):
            queryset = queryset.filter(actif=actif == 'true')
        if params.get('fonction_id'):
            if not params['fonction_id'].isdigit():
                raise serializers.ValidationError({'fonction_id': 'Identifiant invalide.'})
            queryset = queryset.filter(fonctions__fonction_id=params['fonction_id'], fonctions__date_fin__isnull=True, fonctions__principal=True)
        # Un tri ou une recherche sur la fonction joint la table des fonctions : une ligne par personne
        return queryset.distinct()

    def describe(self, instance):
        return f"{instance.nom_complet} ({instance.matricule})"

    def perform_update(self, serializer):
        ancien_statut = serializer.instance.actif
        super().perform_update(serializer)
        if 'actif' in serializer.validated_data and serializer.instance.actif != ancien_statut:
            from apps.accounts.audit import log_action
            log_action(self.request, 'Modification', self.audit_label, serializer.instance,
                       f"{self.describe(serializer.instance)} : {'réactivée' if serializer.instance.actif else 'désactivée'}")

    @action(detail=True, methods=['get'])
    def historique(self, request, pk=None):
        """Travaux, rôles, rémunérations et paiements reçus de la personne (traçabilité)."""
        from apps.finances.historique import historique_personne
        return Response(historique_personne(self.get_object()))


class EquipeViewSet(viewsets.ReadOnlyModelViewSet):
    """Équipes créées avec les travaux (elles se gèrent depuis le travail)."""

    permission_classes = [IsAuthenticated, IsBigBoss]
    serializer_class = EquipeSerializer
    queryset = Equipe.objects.select_related('chef').prefetch_related('travaux').order_by('-date_creation', '-id')


class MembreEquipeViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des anciennes appartenances aux équipes (avant la création des équipes par travail)."""

    permission_classes = [IsAuthenticated, IsBigBoss]
    queryset = MembreEquipe.objects.select_related('personne', 'equipe').order_by('-id')

    def get_serializer_class(self):
        from rest_framework import serializers

        class MembreEquipeSerializer(serializers.ModelSerializer):
            class Meta:
                model = MembreEquipe
                fields = ['id', 'personne_id', 'equipe_id', 'date_debut', 'date_fin', 'role_dans_equipe']

        return MembreEquipeSerializer


class AffectationEquipeBlocViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des anciennes affectations équipe → bloc."""

    permission_classes = [IsAuthenticated, IsBigBoss]
    queryset = AffectationEquipeBloc.objects.select_related('bloc', 'equipe').order_by('-id')

    def get_serializer_class(self):
        from rest_framework import serializers

        class AffectationSerializer(serializers.ModelSerializer):
            class Meta:
                model = AffectationEquipeBloc
                fields = ['id', 'equipe_id', 'bloc_id', 'date_debut', 'date_fin', 'responsable']

        return AffectationSerializer


class UnitesView(APIView):
    """Liste d'unités réutilisable (travaux, achats) ; l'unité par défaut est l'hectare."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'defaut': UNITE_PAR_DEFAUT, 'unites': [{'code': code, 'libelle': libelle} for code, libelle in UNITES]})
