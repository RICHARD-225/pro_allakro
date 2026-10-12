"""
Clôture mensuelle : un mois clôturé est figé.

- clôturer : copie les chiffres du mois (tableau de bord de toute l'exploitation) dans `resume` ; réservé au Big Boss, mois terminé seulement ;
- tant que le mois est clôturé, toute écriture sur une donnée de ce mois est refusée (travaux, dépenses, achats, mouvements de stock,
  rémunérations, paiements dont la date OU celle de la rémunération / de l'achat tombe dans le mois) ;
- rouvrir : le Big Boss lève la clôture (tracée au journal) ; le contrôle `verifier_coherence` compare les chiffres d'un mois clôturé à sa copie.
"""
from django.utils import timezone
from rest_framework import serializers

from apps.core.utils import periode_of
from apps.core.validators import libelle_periode

from .models import ClotureMensuelle


def periodes_cloturees():
    return set(ClotureMensuelle.objects.filter(cloturee=True).values_list('periode', flat=True))


def verifier_ouverte(*dates):
    """Refuse (400) si l'une des dates tombe dans un mois clôturé."""
    mois = {periode_of(d) for d in dates if d}
    if not mois:
        return
    fermes = mois & periodes_cloturees()
    if fermes:
        noms = ', '.join(libelle_periode(p) for p in sorted(fermes))
        raise serializers.ValidationError({'detail': (
            f"La période {noms} est clôturée : aucune écriture n'est possible sur ses données. "
            "Le Big Boss peut rouvrir le mois (Bilan mensuel).")})


def resume_periode(periode):
    from .tableau_de_bord import construire_tableau, periodes_disponibles
    donnees = construire_tableau(periode, periodes_disponibles(), None, None)
    donnees.pop('periodes', None)
    donnees.pop('periode', None)
    return donnees


def cloturer(periode, utilisateur, commentaire=''):
    from apps.core.utils import parse_periode
    try:
        parse_periode(periode)
    except Exception:
        raise serializers.ValidationError({'periode': 'Période invalide (format attendu : AAAA-MM).'})
    if periode >= timezone.localdate().strftime('%Y-%m'):
        raise serializers.ValidationError({'periode': 'Seul un mois terminé peut être clôturé.'})
    existante = ClotureMensuelle.objects.filter(periode=periode).first()
    if existante is not None and existante.cloturee:
        raise serializers.ValidationError({'periode': 'Ce mois est déjà clôturé.'})
    valeurs = {'cloturee': True, 'date_cloture': timezone.now(), 'cloturee_par': utilisateur,
               'resume': resume_periode(periode), 'commentaire': (commentaire or '')[:255],
               'date_reouverture': None, 'reouverte_par': None}
    if existante is None:
        return ClotureMensuelle.objects.create(periode=periode, **valeurs)
    for champ, valeur in valeurs.items():
        setattr(existante, champ, valeur)
    existante.save()
    return existante


def rouvrir(periode, utilisateur):
    cloture = ClotureMensuelle.objects.filter(periode=periode, cloturee=True).first()
    if cloture is None:
        raise serializers.ValidationError({'periode': "Ce mois n'est pas clôturé."})
    cloture.cloturee = False
    cloture.date_reouverture = timezone.now()
    cloture.reouverte_par = utilisateur
    cloture.save()
    return cloture
