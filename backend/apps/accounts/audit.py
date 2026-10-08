"""Journalisation des actions et viewset de base commun à toute l'API."""
from django.db.models import ProtectedError, RestrictedError
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.utils import parse_periode

from .models import Journal
from .permissions import IsBigBoss


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    return (forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')) or None


def log_action(request, action, entite, objet=None, details=''):
    user = getattr(request, 'user', None)
    Journal.objects.create(
        utilisateur=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        table_concernee=entite,
        objet_id=getattr(objet, 'pk', None),
        details=str(details)[:255],
        adresse_ip=client_ip(request),
    )


class BaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet de base :
    - authentification obligatoire ; certaines actions réservées au Big Boss (`big_boss_actions`)
    - journal d'audit automatique (création / modification / suppression)
    - filtres simples par paramètres d'URL (`filter_map`) et par période AAAA-MM (`periode_field`)
    - suppression refusée proprement quand l'élément est utilisé ailleurs
    """

    permission_classes = [IsAuthenticated]
    big_boss_actions = ('destroy',)
    audit_label = ''
    filter_map = {}
    periode_field = None

    def get_permissions(self):
        if self.action in self.big_boss_actions:
            return [IsAuthenticated(), IsBigBoss()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params
        for param, lookup in self.filter_map.items():
            value = params.get(param)
            if value in (None, ''):
                continue
            if param.endswith('_id') and not str(value).isdigit():
                raise serializers.ValidationError({param: 'Identifiant invalide.'})
            queryset = queryset.filter(**{lookup: value})
        periode = params.get('periode')
        if periode and self.periode_field:
            try:
                debut, fin = parse_periode(periode)
            except Exception:
                raise serializers.ValidationError({'periode': 'Période invalide (format attendu : AAAA-MM).'})
            queryset = queryset.filter(**{f'{self.periode_field}__range': (debut, fin)})
        return queryset

    def describe(self, instance):
        return str(instance)

    def perform_create(self, serializer):
        instance = serializer.save()
        log_action(self.request, 'Création', self.audit_label, instance, self.describe(instance))

    def perform_update(self, serializer):
        instance = serializer.save()
        log_action(self.request, 'Modification', self.audit_label, instance, self.describe(instance))

    def perform_destroy(self, instance):
        details = self.describe(instance)
        pk = instance.pk
        try:
            instance.delete()
        except (ProtectedError, RestrictedError):
            raise serializers.ValidationError({
                'detail': "Suppression impossible : cet élément est utilisé par d'autres enregistrements. "
                          "Désactivez-le plutôt.",
            })
        instance.pk = pk
        log_action(self.request, 'Suppression', self.audit_label, instance, details)


class CodePreviewMixin:
    """GET .../prochain-code/ : code qui sera attribué au prochain enregistrement."""

    @action(detail=False, methods=['get'], url_path='prochain-code')
    def prochain_code(self, request):
        return Response({'code': self.get_queryset().model.preview_code()})
