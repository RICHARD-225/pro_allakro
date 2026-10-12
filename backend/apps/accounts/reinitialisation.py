"""
Mot de passe oublié : le titulaire reçoit par e-mail un lien à usage unique, valable 30 minutes.

Sécurité : jeton aléatoire de 256 bits dont seule l'empreinte est stockée ; une demande plus récente annule les précédentes ; 3 demandes
par heure et par compte au plus ; la réponse de l'API est identique que le compte existe ou non (aucune devinette d'identifiants) ;
le changement ferme toutes les sessions ouvertes du compte.
"""
import hashlib
import logging
import secrets
import threading
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils import timezone

from . import jetons
from .models import ReinitialisationMotDePasse, Utilisateur

journal = logging.getLogger('allakro.securite')
DUREE = timedelta(minutes=30)
MAX_DEMANDES_PAR_HEURE = 3


def empreinte(jeton):
    return hashlib.sha256(jeton.encode()).hexdigest()


def _envoyer(destinataire, prenom, jeton):
    lien = f"{settings.FRONTEND_URL.rstrip('/')}/reinitialiser-mot-de-passe?token={jeton}"
    message = (
        f"Bonjour {prenom},\n\n"
        "Une demande de réinitialisation du mot de passe de votre compte ALLAKRO a été faite.\n"
        f"Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes, utilisable une seule fois) :\n\n{lien}\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\n"
        "— ALLAKRO, gestion des plantations\n"
    )
    try:
        send_mail('ALLAKRO — Réinitialisation de votre mot de passe', message, None, [destinataire])
    except Exception:  # un échec d'envoi ne doit jamais se voir côté client (ni révéler si le compte existe)
        journal.exception('Échec d\'envoi du courrier de réinitialisation')


def demander(email, adresse_ip=None):
    """Crée la demande et envoie le courrier. Ne lève jamais d'erreur et ne révèle rien sur l'existence du compte."""
    compte = Utilisateur.objects.select_related('personne').filter(username__iexact=(email or '').strip(), actif=True).first()
    if compte is None:
        return False
    maintenant = timezone.now()
    if compte.reinitialisations.filter(date_creation__gt=maintenant - timedelta(hours=1)).count() >= MAX_DEMANDES_PAR_HEURE:
        journal.warning('Trop de demandes de réinitialisation pour %s', compte.username)
        return False
    compte.reinitialisations.filter(utilise_le__isnull=True, expire_le__gt=maintenant).update(expire_le=maintenant)
    jeton = secrets.token_urlsafe(32)
    ReinitialisationMotDePasse.objects.create(utilisateur=compte, empreinte=empreinte(jeton), expire_le=maintenant + DUREE, adresse_ip=adresse_ip)
    prenom = compte.personne.prenom or compte.personne.nom
    if getattr(settings, 'EMAIL_ENVOI_ASYNCHRONE', False):
        # Envoi en arrière-plan : la durée de réponse ne dépend pas de l'existence du compte
        threading.Thread(target=_envoyer, args=(compte.username, prenom, jeton), daemon=True).start()
    else:
        _envoyer(compte.username, prenom, jeton)
    return True


def trouver(jeton):
    """Demande valide (jeton connu, non utilisé, non expiré) ou None."""
    if not jeton:
        return None
    return (ReinitialisationMotDePasse.objects.select_related('utilisateur')
            .filter(empreinte=empreinte(jeton), utilise_le__isnull=True, expire_le__gt=timezone.now(), utilisateur__actif=True).first())


def reinitialiser(jeton, nouveau_mot_de_passe):
    """Applique le nouveau mot de passe ; retourne le compte, ou None si le jeton est invalide. Lève DjangoValidationError si trop faible."""
    demande = trouver(jeton)
    if demande is None:
        return None
    compte = demande.utilisateur
    validate_password(nouveau_mot_de_passe, compte)
    compte.password_hash = make_password(nouveau_mot_de_passe)
    compte.save(update_fields=['password_hash'])
    demande.utilise_le = timezone.now()
    demande.save(update_fields=['utilise_le'])
    compte.reinitialisations.filter(utilise_le__isnull=True).update(expire_le=timezone.now())
    jetons.invalider_sessions(compte)
    return compte


__all__ = ['demander', 'reinitialiser', 'trouver', 'DjangoValidationError']
