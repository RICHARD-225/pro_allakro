"""Règles métier du personnel : fonction principale (avec historique), unicité des personnes et des fonctions."""
from django.db.models import Prefetch
from django.utils import timezone

from .models import Fonction, Personne, PersonneFonction, telephone_normalise_sql
from .utils import normaliser_espaces, normaliser_libelle, normaliser_telephone


def personnes_queryset():
    """Personnes avec bloc, campement, plantation et fonction actuelle préchargés (évite les requêtes en boucle)."""
    return Personne.objects.select_related('bloc__campement__plantation', 'campement__plantation').prefetch_related(
        Prefetch(
            'fonctions',
            queryset=PersonneFonction.objects.filter(date_fin__isnull=True, principal=True).select_related('fonction'),
            to_attr='fonctions_actuelles',
        ),
    )


def oublier_cache(obj, *attrs):
    for attr in attrs:
        obj.__dict__.pop(attr, None)


def definir_fonction(personne, fonction, date=None):
    """Change la fonction principale en conservant l'historique."""
    date = date or timezone.localdate()
    actuelle = personne.fonction_actuelle()
    if actuelle and actuelle.pk == fonction.pk:
        return
    PersonneFonction.objects.filter(personne=personne, principal=True, date_fin__isnull=True).update(date_fin=date)
    PersonneFonction.objects.create(personne=personne, fonction=fonction, principal=True, date_debut=date)
    oublier_cache(personne, 'fonctions_actuelles')


def fonction_existante(libelle):
    """Fonction de même libellé, sans tenir compte des majuscules ni des espaces en trop."""
    return Fonction.objects.filter(libelle__iexact=normaliser_libelle(libelle)).first()


def resoudre_fonction(fonction=None, libelle=''):
    """Fonction choisie dans la liste, ou saisie librement : réutilisée si elle existe, créée sinon."""
    if fonction is not None:
        return fonction
    libelle = normaliser_libelle(libelle)
    if not libelle:
        return None
    return fonction_existante(libelle) or Fonction.objects.create(libelle=libelle)


def personne_en_double(nom, prenom, exclure=None):
    """Personne déjà enregistrée sous ce nom et ce prénom (majuscules et espaces ignorés)."""
    doublons = Personne.objects.filter(nom__iexact=normaliser_espaces(nom), prenom__iexact=normaliser_espaces(prenom))
    if exclure is not None:
        doublons = doublons.exclude(pk=exclure.pk)
    return doublons.first()


def telephone_attribue(telephone, exclure=None):
    """Personne qui a déjà ce numéro, quelle que soit sa mise en forme (espaces, tirets, points)."""
    numero = normaliser_telephone(telephone)
    if not numero:
        return None
    doublons = Personne.objects.annotate(numero=telephone_normalise_sql()).filter(numero=numero)
    if exclure is not None:
        doublons = doublons.exclude(pk=exclure.pk)
    return doublons.first()
