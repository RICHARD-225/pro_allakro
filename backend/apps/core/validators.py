"""Validations serveur réutilisées par les serializers."""
import re
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from .utils import parse_periode

TELEPHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{7,19}$")
MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
        'Septembre', 'Octobre', 'Novembre', 'Décembre']


def texte_obligatoire(value, label="Ce champ"):
    value = (value or "").strip()
    if not value:
        raise serializers.ValidationError(f"{label} est obligatoire.")
    return value


def telephone(value):
    value = (value or "").strip()
    if value and not TELEPHONE_RE.match(value):
        raise serializers.ValidationError("Numéro de téléphone invalide (8 chiffres minimum).")
    return value


def pas_dans_le_futur(value, label="La date"):
    if value and value > timezone.localdate():
        raise serializers.ValidationError(f"{label} ne peut pas être dans le futur.")
    return value


def strictement_positif(value, label="Le montant"):
    if value is None or Decimal(value) <= 0:
        raise serializers.ValidationError(f"{label} doit être supérieur à 0.")
    return value


def positif_ou_nul(value, label="La valeur"):
    if value is not None and Decimal(value) < 0:
        raise serializers.ValidationError(f"{label} ne peut pas être négatif(ve).")
    return value


def periode(value):
    try:
        parse_periode(value)
    except Exception:
        raise serializers.ValidationError("Période invalide (format attendu : AAAA-MM).")
    return value


def libelle_periode(value):
    debut, _ = parse_periode(value)
    return f"{MOIS[debut.month - 1]} {debut.year}"


def actif(obj, label):
    if obj is not None and not getattr(obj, 'actif', True):
        raise serializers.ValidationError(f"{label} est désactivé(e).")
    return obj


def unique_insensible(queryset, field, value, instance, message):
    qs = queryset.filter(**{f"{field}__iexact": value})
    if instance is not None:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists():
        raise serializers.ValidationError(message)
    return value


class RelatedField(serializers.PrimaryKeyRelatedField):
    """PrimaryKeyRelatedField avec des messages d'erreur métier en français."""

    default_error_messages = {
        'required': 'Ce champ est obligatoire.',
        'null': 'Ce champ est obligatoire.',
        'does_not_exist': 'Élément introuvable.',
        'incorrect_type': 'Identifiant invalide.',
    }
