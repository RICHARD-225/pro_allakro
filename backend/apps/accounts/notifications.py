"""
Notifications de l'application (cloche de l'en-tête).

Événements : stock passé sous le seuil, paiement ou travail annulé, compte bloqué après trop d'échecs de connexion, clôture ou
réouverture d'un mois, rémunérations restant à payer (rappel quotidien calculé à la consultation).
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .models import Notification, RoleUtilisateur, Utilisateur


def destinataires(roles=None, exclure=None):
    """Comptes actifs, éventuellement limités à des rôles, sans l'auteur de l'action."""
    comptes = Utilisateur.objects.filter(actif=True)
    if roles:
        comptes = comptes.filter(role__code__in=roles)
    if exclure is not None:
        comptes = comptes.exclude(pk=getattr(exclure, 'pk', exclure))
    return comptes


def notifier(comptes, type_, titre, message='', lien='', cle=''):
    """Crée la notification pour chaque compte (une seule fois par compte quand `cle` est renseignée)."""
    creees = []
    for compte in comptes:
        if cle and Notification.objects.filter(utilisateur=compte, cle=cle).exists():
            continue
        creees.append(Notification(utilisateur=compte, type=type_, titre=titre[:150], message=message[:255], lien=lien[:150], cle=cle[:120]))
    Notification.objects.bulk_create(creees, ignore_conflicts=True)
    return len(creees)


def notifier_big_boss(type_, titre, message='', lien='', cle='', auteur=None):
    return notifier(destinataires([RoleUtilisateur.BIG_BOSS], exclure=auteur), type_, titre, message, lien, cle)


def alerte_stock(produit, stock_avant, stock_apres, auteur=None):
    """Notifie tous les comptes quand le stock d'un produit passe SOUS son seuil (pas à chaque mouvement)."""
    if produit.stock_minimum > 0 and stock_avant >= produit.stock_minimum > stock_apres:
        notifier(destinataires(exclure=auteur), 'stock', f'Stock sous le seuil : {produit.nom}',
                 f'{stock_apres.normalize():f} {produit.unite} en stock (seuil {produit.stock_minimum.normalize():f}).', '/stock')


def rappel_remunerations(utilisateur):
    """Rappel quotidien au Super admin : rémunérations de travaux terminés depuis plus de 7 jours qui restent à payer."""
    from apps.finances.models import PaiementSalaire, Salaire

    if not getattr(utilisateur, 'is_big_boss', False):
        return
    aujourdhui = timezone.localdate()
    cle = f'salaires-a-payer:{aujourdhui.isoformat()}'
    if Notification.objects.filter(utilisateur=utilisateur, cle=cle).exists():
        return
    salaires = Salaire.objects.filter(annulee=False, date_fin__lt=aujourdhui - timedelta(days=7)).exclude(travail__statut='ANNULE')
    du = salaires.aggregate(t=Sum('montant_net'))['t'] or Decimal('0')
    paye = PaiementSalaire.objects.filter(salaire__in=salaires, annule=False).aggregate(t=Sum('montant'))['t'] or Decimal('0')
    reste = du - paye
    if reste <= 0:
        return
    nombre = sum(1 for s in salaires.annotate(p=Sum('paiements__montant', filter=Q(paiements__annule=False))) if (s.p or 0) < s.montant_net)
    notifier([utilisateur], 'salaires', 'Rémunérations à payer',
             f"{nombre} rémunération(s) en attente depuis plus de 7 jours : {reste:,.0f} FCFA restent à payer.".replace(',', ' '),
             '/salaires', cle)
