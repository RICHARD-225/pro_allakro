"""Période (AAAA-MM) et périmètre (campement / bloc) d'un rapport, lus dans les paramètres de la requête."""
from rest_framework import serializers

from apps.core.models import Bloc, Campement
from apps.core.utils import parse_periode
from apps.core.validators import libelle_periode
from apps.finances.models import Salaire
from apps.finances.views import filtre_perimetre_salaires


class Perimetre:
    """Filtres communs à toutes les feuilles : un bloc l'emporte sur un campement ; sans période = tout l'historique."""

    def __init__(self, periode=None, campement_id=None, bloc_id=None):
        self.periode = periode or None
        self.debut = self.fin = None
        if self.periode:
            try:
                self.debut, self.fin = parse_periode(self.periode)
            except Exception:
                raise serializers.ValidationError({'periode': 'Période invalide (format attendu : AAAA-MM).'})

        for nom, valeur in (('campement_id', campement_id), ('bloc_id', bloc_id)):
            if valeur and not str(valeur).isdigit():
                raise serializers.ValidationError({nom: 'Identifiant invalide.'})

        self.bloc = None
        self.campement = None
        if bloc_id:
            self.bloc = Bloc.objects.select_related('campement').filter(pk=bloc_id).first()
            if self.bloc is None:
                raise serializers.ValidationError({'bloc_id': 'Élément introuvable.'})
            self.campement = self.bloc.campement
        elif campement_id:
            self.campement = Campement.objects.filter(pk=campement_id).first()
            if self.campement is None:
                raise serializers.ValidationError({'campement_id': 'Élément introuvable.'})

    @classmethod
    def depuis_parametres(cls, params):
        return cls(params.get('periode'), params.get('campement_id'), params.get('bloc_id'))

    # --- Libellés ---
    @property
    def libelle_periode(self):
        return libelle_periode(self.periode) if self.periode else 'Toutes les périodes'

    @property
    def libelle_perimetre(self):
        if self.bloc:
            return f"Bloc {self.bloc.code} — {self.bloc.nom} ({self.campement.nom})"
        if self.campement:
            return f"{self.campement.nom} ({self.campement.code})"
        return "Toute l'exploitation"

    @property
    def nom_fichier(self):
        suffixe = f"_{self.bloc.code}" if self.bloc else (f"_{self.campement.code}" if self.campement else '')
        return f"ALLAKRO_Rapport_{self.periode or 'complet'}{suffixe}.xlsx"

    # --- Filtres ---
    def filtrer(self, queryset, bloc='bloc_id', campement='campement_id'):
        if self.bloc:
            return queryset.filter(**{bloc: self.bloc.pk})
        if self.campement:
            return queryset.filter(**{campement: self.campement.pk})
        return queryset

    def sur_periode(self, queryset, champ):
        return queryset.filter(**{f'{champ}__range': (self.debut, self.fin)}) if self.debut else queryset

    def salaires(self, avec_annulees=False):
        """Rémunérations du périmètre (bloc du travail ou de la personne), du mois choisi ; hors annulées par défaut."""
        queryset = Salaire.objects.all()
        if not avec_annulees:
            queryset = queryset.filter(annulee=False).exclude(travail__statut='ANNULE')
        if self.debut:
            queryset = queryset.filter(date_debut__range=(self.debut, self.fin))
        return filtre_perimetre_salaires(queryset, self.bloc.pk if self.bloc else None,
                                         self.campement.pk if self.campement and not self.bloc else None)
