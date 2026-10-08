from django.db.models import Prefetch
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.audit import BaseViewSet, CodePreviewMixin, log_action
from apps.core.models import AffectationEquipeBloc, MembreEquipe

from .calculs import annoter_salaires
from .models import CategorieDepense, Depense, PaiementSalaire, Prevision, Salaire
from .serializers import (
    CategorieDepenseSerializer, DepenseSerializer, PaiementGroupeSerializer, PaiementSalaireSerializer,
    PrevisionSerializer, SalaireSerializer,
)


def personnes_du_bloc(bloc_id):
    """Personnes dont l'équipe actuelle est affectée au bloc."""
    return MembreEquipe.objects.filter(
        date_fin__isnull=True,
        equipe__affectations_blocs__date_fin__isnull=True,
        equipe__affectations_blocs__bloc_id=bloc_id,
    ).values('personne_id')


def prefetch_personne(prefix):
    """Équipe et bloc actuels d'une personne (préchargés pour les listes)."""
    return [
        Prefetch(f'{prefix}participations_equipes',
                 queryset=MembreEquipe.objects.filter(date_fin__isnull=True).select_related('equipe'),
                 to_attr='memberships_actuels'),
        Prefetch(f'{prefix}memberships_actuels__equipe__affectations_blocs',
                 queryset=AffectationEquipeBloc.objects.filter(date_fin__isnull=True).select_related('bloc'),
                 to_attr='affectations_actuelles'),
    ]


class CategorieDepenseViewSet(CodePreviewMixin, BaseViewSet):
    queryset = CategorieDepense.objects.all()
    serializer_class = CategorieDepenseSerializer
    audit_label = 'Catégorie de dépense'

    def perform_destroy(self, instance):
        if instance.systeme:
            raise serializers.ValidationError({'detail': 'Cette catégorie système ne peut pas être supprimée.'})
        super().perform_destroy(instance)


class DepenseViewSet(BaseViewSet):
    queryset = Depense.objects.select_related('categorie', 'bloc', 'campement', 'achat_particulier')
    serializer_class = DepenseSerializer
    audit_label = 'Dépense'
    filter_map = {
        'bloc_id': 'bloc_id',
        'campement_id': 'campement_id',
        'categorie_id': 'categorie_id',
        'statut': 'statut',
    }
    periode_field = 'date_depense'

    def describe(self, instance):
        return f"{instance.designation} ({instance.montant_total} FCFA)"

    def _refuser_si_achat(self, instance):
        if getattr(instance, 'achat_particulier', None):
            raise serializers.ValidationError({'detail': (
                "Cette dépense provient d'un achat particulier : modifiez ou supprimez l'achat lui-même.")})

    def perform_update(self, serializer):
        self._refuser_si_achat(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._refuser_si_achat(instance)
        super().perform_destroy(instance)


class SalaireViewSet(BaseViewSet):
    serializer_class = SalaireSerializer
    audit_label = 'Rémunération'
    filter_map = {'personne_id': 'personne_id', 'campement_id': 'personne__campement_id'}
    periode_field = 'date_debut'

    def get_queryset(self):
        self.queryset = annoter_salaires(
            Salaire.objects.select_related('personne').prefetch_related(*prefetch_personne('personne__'))
        ).order_by('-date_debut', 'personne__nom', 'personne__prenom')
        queryset = super().get_queryset()
        bloc_id = self.request.query_params.get('bloc_id')
        if bloc_id:
            # Sous-requête : un filtre par jointure fausserait la somme des paiements annotée
            queryset = queryset.filter(personne_id__in=personnes_du_bloc(bloc_id))
        return queryset

    def describe(self, instance):
        return f"{instance.personne.nom_complet} — {instance.periode} ({instance.montant_net} FCFA net)"

    def perform_destroy(self, instance):
        if instance.paiements.exists():
            raise serializers.ValidationError({'detail': 'Cette rémunération a déjà des paiements : elle ne peut pas être supprimée.'})
        super().perform_destroy(instance)


class PaiementSalaireViewSet(BaseViewSet):
    """Les paiements ne se modifient pas (traçabilité) : on les supprime puis on les ressaisit."""

    serializer_class = PaiementSalaireSerializer
    audit_label = 'Paiement'
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    filter_map = {
        'personne_id': 'salaire__personne_id',
        'equipe_id': 'equipe_id',
        'campement_id': 'salaire__personne__campement_id',
    }
    periode_field = 'salaire__date_debut'

    def get_queryset(self):
        self.queryset = PaiementSalaire.objects.select_related('salaire__personne', 'equipe').prefetch_related(
            *prefetch_personne('salaire__personne__'),
            Prefetch('equipe__affectations_blocs',
                     queryset=AffectationEquipeBloc.objects.filter(date_fin__isnull=True).select_related('bloc'),
                     to_attr='affectations_actuelles'),
        )
        queryset = super().get_queryset()
        mode = self.request.query_params.get('mode')
        if mode == 'EQUIPE':
            queryset = queryset.exclude(groupe='')
        elif mode == 'INDIVIDUEL':
            queryset = queryset.filter(groupe='')
        return queryset

    def describe(self, instance):
        return f"{instance.montant} FCFA à {instance.salaire.personne.nom_complet} ({instance.salaire.periode})"

    def perform_create(self, serializer):
        instance = serializer.save()
        log_action(self.request, 'Paiement', self.audit_label, instance, self.describe(instance))

    @action(detail=False, methods=['post'], url_path='groupe')
    def groupe(self, request):
        serializer = PaiementGroupeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paiements = serializer.save()
        equipe = serializer.validated_data['equipe_id']
        total = sum(p.montant for p in paiements)
        log_action(request, 'Paiement', 'Paiement groupé', paiements[0],
                   f"{len(paiements)} paiement(s) — {equipe.nom} — {total} FCFA ({serializer.validated_data['periode']})")
        data = PaiementSalaireSerializer(self.get_queryset().filter(pk__in=[p.pk for p in paiements]), many=True).data
        return Response(data, status=status.HTTP_201_CREATED)


class PrevisionViewSet(BaseViewSet):
    queryset = Prevision.objects.select_related('campement', 'bloc', 'categorie')
    serializer_class = PrevisionSerializer
    audit_label = 'Prévision'
    filter_map = {'campement_id': 'campement_id', 'bloc_id': 'bloc_id', 'categorie_id': 'categorie_id'}
    periode_field = 'periode_debut'

    def describe(self, instance):
        return f"{instance.designation} ({instance.montant_prevu} FCFA)"
