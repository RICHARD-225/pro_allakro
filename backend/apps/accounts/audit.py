"""Journalisation des actions et viewset de base commun à toute l'API."""
from contextlib import contextmanager

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models import ProtectedError, RestrictedError
from rest_framework import exceptions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.utils import parse_date_filtre, parse_periode

from .models import Journal
from .permissions import IsBigBoss


def client_ip(request):
    """
    Adresse IP du client. L'en-tête X-Forwarded-For n'est lu que derrière des serveurs mandataires de confiance
    (TRUSTED_PROXY_COUNT) et on prend l'adresse ajoutée par le premier d'entre eux : un client ne peut pas la falsifier.
    """
    nombre = settings.TRUSTED_PROXY_COUNT
    if nombre > 0:
        adresses = [a.strip() for a in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if a.strip()]
        if len(adresses) >= nombre:
            return adresses[-nombre]
    return request.META.get('REMOTE_ADDR') or None


@contextmanager
def doublon_refuse():
    """Une contrainte d'unicité PostgreSQL violée (saisie simultanée, double clic) devient une erreur 400 lisible."""
    try:
        with transaction.atomic():
            yield
    except IntegrityError:
        raise serializers.ValidationError({'detail': (
            "Cet enregistrement existe déjà : la base de données a refusé le doublon. Rechargez la page et vérifiez.")})


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
    - filtres simples par paramètres d'URL (`filter_map`) et par période (`periode_field`) :
      `periode=AAAA-MM`, ou `date_debut=AAAA-MM-JJ` et/ou `date_fin=AAAA-MM-JJ` (bornes incluses)
    - tri par défaut (`ordre_defaut`) : les éléments les plus récents d'abord, identifiant en second critère (tri stable)
    - suppression refusée proprement quand l'élément est utilisé ailleurs
    """

    permission_classes = [IsAuthenticated]
    big_boss_actions = ('destroy',)
    audit_label = ''
    filter_map = {}
    periode_field = None
    # Date de création décroissante quand le modèle en a une ; sinon l'identifiant (ordre de saisie).
    # À écrire explicitement : un annotate() fait perdre le Meta.ordering du modèle.
    ordre_defaut = ('-id',)
    # Périmètre d'un superviseur : chemin ORM vers l'identifiant du campement (None = donnée commune à tous les comptes).
    # Le Big Boss voit toute l'exploitation ; un superviseur ne voit et ne modifie que les données de son campement.
    perimetre_lookup = None
    # Liste paginée côté serveur (voir `list`) : champs texte de la recherche (`q`), clés de tri acceptées (`ordering`) et
    # agrégats de la route `totaux/` (indicateurs de la page, calculés sur TOUTES les lignes filtrées, pas sur la page affichée)
    search_fields = ()
    ordering_fields = {}
    totaux_agregats = {}
    taille_page_defaut = 25
    taille_page_max = 200

    def perimetre(self, queryset, ids):
        """Restreint un queryset aux campements `ids` (redéfini quand le lien au campement n'est pas un simple chemin)."""
        if self.perimetre_lookup is None:
            return queryset
        return queryset.filter(**{f'{self.perimetre_lookup}__in': ids})

    def _campements_autorises(self):
        user = getattr(self.request, 'user', None)
        return user.campements_autorises() if hasattr(user, 'campements_autorises') else None

    def verifier_perimetre(self, instance):
        """Après une écriture (dans la transaction) : l'élément doit appartenir au campement du superviseur, sinon tout est annulé."""
        ids = self._campements_autorises()
        if ids is None:
            return
        base = type(instance)._default_manager.all()
        if not self.perimetre(base, ids).filter(pk=instance.pk).exists():
            raise exceptions.PermissionDenied("Cet élément ne se trouve pas dans votre campement : action refusée.")
        self.verifier_references(instance, ids)

    def verifier_cloture(self, *dates):
        """Refuse l'écriture sur une donnée dont la date tombe dans un mois clôturé."""
        from apps.finances.clotures import verifier_ouverte
        verifier_ouverte(*dates)

    def verifier_references(self, instance, ids):
        """Point d'extension : contrôle des éléments liés (ex. personnes d'un travail)."""

    def get_permissions(self):
        if self.action in self.big_boss_actions:
            return [IsAuthenticated(), IsBigBoss()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        ids = self._campements_autorises()
        if ids is not None:
            queryset = self.perimetre(queryset, ids)
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
        if self.periode_field:
            # Période personnalisée : date de début et/ou date de fin (bornes incluses), sur la date de l'opération
            date_debut = self._date_filtre(params, 'date_debut')
            date_fin = self._date_filtre(params, 'date_fin')
            if date_debut and date_fin and date_fin < date_debut:
                raise serializers.ValidationError({'date_fin': 'La date de fin doit être postérieure ou égale à la date de début.'})
            if date_debut:
                queryset = queryset.filter(**{f'{self.periode_field}__gte': date_debut})
            if date_fin:
                queryset = queryset.filter(**{f'{self.periode_field}__lte': date_fin})
        return queryset.order_by(*self.ordre_defaut)

    def recherche_et_tri(self, queryset):
        """Recherche plein texte (`q`, sans accents ni majuscules, tous les mots) et tri (`ordering=cle` ou `-cle`)."""
        params = self.request.query_params
        q = (params.get('q') or '').strip()[:100]
        if q and self.search_fields:
            for mot in q.split():
                condition = Q()
                for champ in self.search_fields:
                    condition |= Q(**{f'{champ}__unaccent__icontains': mot})
                queryset = queryset.filter(condition)
        ordering = params.get('ordering') or ''
        cle = ordering.lstrip('-')
        if cle in self.ordering_fields:
            expressions = self.ordering_fields[cle]
            expressions = (expressions,) if isinstance(expressions, str) else tuple(expressions)
            descendant = ordering.startswith('-')
            queryset = queryset.order_by(*[(e[1:] if e.startswith('-') else '-' + e) if descendant else e for e in expressions], '-id' if descendant else 'id')
        return queryset

    def list(self, request, *args, **kwargs):
        """
        Sans paramètre `page` : liste complète (compatibilité). Avec `page` (et `page_size`) : liste paginée côté serveur
        `{count, page, page_size, pages, results}`, filtrée par les paramètres habituels, `q` (recherche) et `ordering`.
        """
        queryset = self.recherche_et_tri(self.filter_queryset(self.get_queryset()))
        if request.query_params.get('page') is None:
            return Response(self.get_serializer(queryset, many=True).data)
        try:
            taille = max(1, min(int(request.query_params.get('page_size') or self.taille_page_defaut), self.taille_page_max))
            numero = max(1, int(request.query_params.get('page')))
        except ValueError:
            raise serializers.ValidationError({'page': 'Numéro de page ou taille de page invalide.'})
        total = queryset.count()
        pages = max(1, -(-total // taille))
        numero = min(numero, pages)
        lignes = queryset[(numero - 1) * taille: numero * taille]
        return Response({'count': total, 'page': numero, 'page_size': taille, 'pages': pages,
                         'results': self.get_serializer(lignes, many=True).data})

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """Indicateurs de la page (somme, nombre…) sur toutes les lignes correspondant aux filtres et à la recherche."""
        if not self.totaux_agregats:
            raise exceptions.NotFound()
        queryset = self.recherche_et_tri(self.filter_queryset(self.get_queryset())).order_by()
        valeurs = queryset.aggregate(**self.totaux_agregats)
        return Response({cle: float(v) if v is not None and not isinstance(v, int) else (v or 0) for cle, v in valeurs.items()})

    @staticmethod
    def _date_filtre(params, nom):
        try:
            return parse_date_filtre(params.get(nom))
        except Exception:
            raise serializers.ValidationError({nom: 'Date invalide (format attendu : AAAA-MM-JJ).'})

    def describe(self, instance):
        return str(instance)

    def perform_create(self, serializer):
        if self.periode_field:
            self.verifier_cloture(serializer.validated_data.get(self.periode_field))
        with doublon_refuse():
            instance = serializer.save()
            self.verifier_perimetre(instance)
        log_action(self.request, 'Création', self.audit_label, instance, self.describe(instance))

    def perform_update(self, serializer):
        if self.periode_field:
            self.verifier_cloture(getattr(serializer.instance, self.periode_field, None), serializer.validated_data.get(self.periode_field))
        with doublon_refuse():
            instance = serializer.save()
            self.verifier_perimetre(instance)
        log_action(self.request, 'Modification', self.audit_label, instance, self.describe(instance))

    def perform_destroy(self, instance):
        if self.periode_field:
            self.verifier_cloture(getattr(instance, self.periode_field, None))
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
