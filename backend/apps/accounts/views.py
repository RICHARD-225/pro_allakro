import logging
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.hashers import check_password, make_password
from django.middleware.csrf import get_token
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import BaseViewSet, client_ip, log_action
from . import jetons, notifications, reinitialisation
from .limitation import LimitationDebitMixin, debloquer, delai_avant_tentative, enregistrer_tentative
from .securite import evenement
from .models import Journal, Notification, RoleUtilisateur, Utilisateur
from .permissions import IsBigBoss
from .serializers import (
    ChangementMotDePasseSerializer, JournalSerializer, LoginSerializer, MeSerializer, MotDePasseOublieSerializer,
    ReinitialiserMotDePasseSerializer, RoleSerializer, UtilisateurSerializer,
)


def set_auth_cookies(response, access=None, refresh=None):
    """Cookies httpOnly : jeton d'accès (tout le site) et jeton de rafraîchissement (limité au chemin /api/v1/auth/)."""
    jwt = settings.SIMPLE_JWT
    options = {'httponly': True, 'secure': not settings.DEBUG, 'samesite': jwt['AUTH_COOKIE_SAMESITE']}
    if access:
        response.set_cookie(jwt['AUTH_COOKIE'], access, max_age=int(jwt['ACCESS_TOKEN_LIFETIME'].total_seconds()),
                            path='/', **options)
    if refresh:
        response.set_cookie(jwt['AUTH_COOKIE_REFRESH'], refresh, max_age=int(jwt['REFRESH_TOKEN_LIFETIME'].total_seconds()),
                            path=jwt['AUTH_COOKIE_REFRESH_PATH'], **options)


def effacer_cookies(response):
    jwt = settings.SIMPLE_JWT
    response.delete_cookie(jwt['AUTH_COOKIE'], path='/')
    response.delete_cookie(jwt['AUTH_COOKIE_REFRESH'], path=jwt['AUTH_COOKIE_REFRESH_PATH'])
    response.delete_cookie(jwt['AUTH_COOKIE_REFRESH'], path='/')  # anciens cookies émis avant le chemin restreint


_EMPREINTE_FACTICE = []


def _verifier_mot_de_passe(mot_de_passe, utilisateur):
    """Vrai si le mot de passe correspond. Sans utilisateur, un faux calcul de même durée évite de révéler quels identifiants existent."""
    if utilisateur is None:
        if not _EMPREINTE_FACTICE:
            _EMPREINTE_FACTICE.append(make_password('mot-de-passe-factice'))
        check_password(mot_de_passe, _EMPREINTE_FACTICE[0])
        return False
    return check_password(mot_de_passe, utilisateur.password_hash)


class CsrfView(APIView):
    """GET /auth/csrf/ : pose le cookie « csrftoken » ; l'interface renvoie sa valeur dans l'en-tête X-CSRFToken."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'csrfToken': get_token(request)})


class SanteView(APIView):
    """GET /sante/ : sonde de disponibilité (base de données joignable) pour l'hébergeur ; aucune donnée sensible."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            Utilisateur.objects.exists()
        except Exception:
            return Response({'ok': False}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'ok': True})


class LoginView(LimitationDebitMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # un cookie expiré ne doit pas bloquer la connexion
    throttle_scope = 'connexion'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip().lower()
        password = serializer.validated_data['password']
        adresse_ip = client_ip(request)

        # Force brute : couple compte + adresse, compte ou adresse bloqués temporairement après trop d'échecs
        attente = delai_avant_tentative(username, adresse_ip)
        if attente:
            minutes = max(1, -(-attente // 60))
            evenement(request, f'Connexion bloquée (trop d\'échecs) pour {username[:60]}')
            return Response(
                {'detail': f"Trop de tentatives de connexion. Réessayez dans {minutes} minute(s)."},
                status=status.HTTP_429_TOO_MANY_REQUESTS, headers={'Retry-After': str(attente)},
            )

        user = Utilisateur.objects.select_related('role', 'personne__bloc').filter(username__iexact=username).first()
        if not _verifier_mot_de_passe(password, user):
            enregistrer_tentative(username, adresse_ip, reussie=False)
            evenement(request, f'Échec de connexion pour {username[:60]}')
            if delai_avant_tentative(username, adresse_ip) and user is not None:
                # Le blocage vient de s'enclencher : le Super admin est prévenu (une alerte par compte et par heure)
                notifications.notifier_big_boss('securite', f'Connexion bloquée : {user.username}',
                                                'Trop d\'échecs de mot de passe. Le compte peut être débloqué depuis Utilisateurs.', '/utilisateurs',
                                                f'blocage:{user.pk}:{timezone.now():%Y%m%d%H}')
            return Response({'detail': 'Identifiant ou mot de passe incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.actif:
            evenement(request, f'Connexion refusée : compte désactivé {username[:60]}')
            return Response({'detail': 'Ce compte est désactivé. Contactez l’administrateur.'}, status=status.HTTP_403_FORBIDDEN)

        enregistrer_tentative(username, adresse_ip, reussie=True)
        user.derniere_connexion = timezone.now()
        user.save(update_fields=['derniere_connexion'])
        request.user = user
        log_action(request, 'Connexion', 'Authentification', user, f"Connexion de {user.username}")
        evenement(request, f'Connexion réussie de {user.username}', logging.INFO)

        refresh, access = jetons.emettre(user)
        response = Response(MeSerializer(user).data, status=status.HTTP_200_OK)
        set_auth_cookies(response, access=access, refresh=refresh)
        return response


class LogoutView(APIView):
    """Révoque les deux jetons de la session : ils ne servent plus, même s'ils ont été copiés."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        jwt = settings.SIMPLE_JWT
        jetons.revoquer(jetons.lire_acces(request.COOKIES.get(jwt['AUTH_COOKIE'])))
        jetons.revoquer(jetons.lire_refresh(request.COOKIES.get(jwt['AUTH_COOKIE_REFRESH'])))
        response = Response({'detail': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
        effacer_cookies(response)
        return response


class RefreshView(LimitationDebitMixin, APIView):
    """
    Renouvelle la session avec rotation : le jeton de rafraîchissement présenté est révoqué et remplacé. S'il est présenté
    une seconde fois (copie volée), toutes les sessions du compte sont invalidées.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'session'

    def post(self, request):
        refus = Response({'detail': 'Session expirée.'}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = jetons.lire_refresh(request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']))
        if refresh is None:
            return refus
        utilisateur = Utilisateur.objects.select_related('role', 'personne__bloc').filter(pk=refresh.get('user_id'), actif=True).first()
        if utilisateur is None:
            return Response({'detail': 'Compte introuvable ou désactivé.'}, status=status.HTTP_401_UNAUTHORIZED)
        if jetons.est_revoque(refresh):
            jetons.invalider_sessions(utilisateur)
            evenement(request, f'Jeton de rafraîchissement réutilisé : sessions de {utilisateur.username} invalidées')
            effacer = refus
            effacer_cookies(effacer)
            return effacer
        if refresh.get('tv') != utilisateur.token_version:
            return refus
        jetons.revoquer(refresh)
        nouveau_refresh, acces = jetons.emettre(utilisateur)
        response = Response({'detail': 'Session prolongée.'}, status=status.HTTP_200_OK)
        set_auth_cookies(response, access=acces, refresh=nouveau_refresh)
        return response


class MotDePasseOublieView(LimitationDebitMixin, APIView):
    """POST {email} : envoie le lien de réinitialisation. Réponse identique que le compte existe ou non."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'reinit'

    def post(self, request):
        serializer = MotDePasseOublieSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reinitialisation.demander(serializer.validated_data['email'], client_ip(request))
        evenement(request, 'Demande de réinitialisation de mot de passe', logging.INFO)
        return Response({'detail': "Si un compte correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé "
                                   "(valable 30 minutes). Pensez à vérifier vos courriers indésirables."})


class ReinitialiserMotDePasseView(LimitationDebitMixin, APIView):
    """GET ?token= : le lien est-il encore valable ?  POST {token, nouveau_mot_de_passe, confirmation} : choisit le nouveau mot de passe."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'reinit_valider'

    def get(self, request):
        demande = reinitialisation.trouver(request.query_params.get('token', ''))
        return Response({'valide': demande is not None})

    def post(self, request):
        serializer = ReinitialiserMotDePasseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        donnees = serializer.validated_data
        try:
            compte = reinitialisation.reinitialiser(donnees['token'], donnees['nouveau_mot_de_passe'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'nouveau_mot_de_passe': list(exc.messages)})
        if compte is None:
            evenement(request, 'Réinitialisation refusée : lien invalide ou expiré')
            return Response({'detail': 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.'}, status=status.HTTP_400_BAD_REQUEST)
        request.user = compte
        log_action(request, 'Modification', 'Utilisateur', compte, f"Mot de passe de {compte.username} réinitialisé par e-mail")
        evenement(request, f'Mot de passe réinitialisé pour {compte.username}', logging.INFO)
        return Response({'detail': 'Mot de passe modifié. Vous pouvez vous connecter.'})


def _notification(n):
    return {'id': n.pk, 'type': n.type, 'titre': n.titre, 'message': n.message, 'lien': n.lien, 'lue': n.lue, 'date': n.date_creation}


class NotificationsView(APIView):
    """GET : les 50 dernières notifications du compte et le nombre de non lues (rappels du jour calculés au passage)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications.rappel_remunerations(request.user)
        propres = Notification.objects.filter(utilisateur=request.user)
        return Response({'non_lues': propres.filter(lue=False).count(), 'notifications': [_notification(n) for n in propres[:50]]})


class NotificationLireView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        Notification.objects.filter(utilisateur=request.user, pk=pk).update(lue=True)
        return Response({'detail': 'Notification lue.'})


class NotificationsToutLireView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        marquees = Notification.objects.filter(utilisateur=request.user, lue=False).update(lue=True)
        return Response({'marquees': marquees})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangementMotDePasseView(LimitationDebitMixin, APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = 'mot_de_passe'

    def post(self, request):
        serializer = ChangementMotDePasseSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Les autres sessions du compte cessent de valoir ; celle-ci reçoit de nouveaux jetons et continue
        jetons.revoquer(jetons.lire_acces(request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE'])))
        jetons.revoquer(jetons.lire_refresh(request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'])))
        jetons.invalider_sessions(user)
        log_action(request, 'Modification', 'Utilisateur', user, f"Changement de mot de passe de {user.username}")
        refresh, access = jetons.emettre(user)
        response = Response({'detail': 'Mot de passe modifié.'})
        set_auth_cookies(response, access=access, refresh=refresh)
        return response


class UtilisateurViewSet(BaseViewSet):
    queryset = Utilisateur.objects.select_related('personne', 'role')
    serializer_class = UtilisateurSerializer
    permission_classes = [IsAuthenticated, IsBigBoss]
    audit_label = 'Utilisateur'
    ordre_defaut = ('-date_creation', '-id')
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @action(detail=True, methods=['post'])
    def debloquer(self, request, pk=None):
        """Lève le blocage de connexion d'un compte (trop d'échecs de mot de passe)."""
        compte = self.get_object()
        effaces = debloquer(compte.username)
        log_action(request, 'Modification', self.audit_label, compte, f"{compte.username} : blocage de connexion levé ({effaces} échec(s) effacé(s))")
        return Response({'detail': 'Compte débloqué.', 'echecs_effaces': effaces})

    @action(detail=True, methods=['get'])
    def activite(self, request, pk=None):
        """Suivi d'un utilisateur par le Super admin : connexions, actions enregistrées au journal et les plus récentes."""
        compte = self.get_object()
        actions = Journal.objects.filter(utilisateur=compte)
        hors_connexion = actions.exclude(action__in=['Connexion', 'Déconnexion'])
        depuis = timezone.now() - timedelta(days=7)
        par_type = {ligne['action']: ligne['n'] for ligne in hors_connexion.values('action').annotate(n=Count('id'))}
        return Response({
            'id': compte.pk, 'nom': compte.nom_complet, 'email': compte.username, 'role': compte.role.code, 'actif': compte.actif,
            'cree_le': compte.date_creation, 'derniere_connexion': compte.derniere_connexion,
            'nb_connexions': actions.filter(action='Connexion').count(),
            'nb_actions': hors_connexion.count(), 'nb_actions_7_jours': hors_connexion.filter(date_action__gte=depuis).count(),
            'actions_par_type': par_type,
            'dernieres_actions': [
                {'timestamp': j.date_action, 'action': j.action, 'entite': j.table_concernee, 'details': j.details}
                for j in hors_connexion.order_by('-date_action', '-id')[:30]],
        })


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RoleUtilisateur.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]


class JournalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = JournalSerializer
    permission_classes = [IsAuthenticated, IsBigBoss]

    def get_queryset(self):
        queryset = Journal.objects.select_related('utilisateur__personne').order_by('-date_action', '-id')
        params = self.request.query_params
        if params.get('action'):
            queryset = queryset.filter(action=params['action'])
        if params.get('utilisateur_id'):
            if not params['utilisateur_id'].isdigit():
                raise serializers.ValidationError({'utilisateur_id': 'Identifiant invalide.'})
            queryset = queryset.filter(utilisateur_id=params['utilisateur_id'])
        return queryset

    def list(self, request, *args, **kwargs):
        """Sans `page` : les 1000 actions les plus récentes. Avec `page` : liste paginée par le serveur (recherche `q`, tri `ordering`)."""
        queryset = self.get_queryset()
        q = (request.query_params.get('q') or '').strip()[:100]
        for mot in q.split():
            queryset = queryset.filter(
                Q(details__unaccent__icontains=mot) | Q(action__unaccent__icontains=mot) | Q(table_concernee__unaccent__icontains=mot)
                | Q(utilisateur__personne__nom__unaccent__icontains=mot) | Q(utilisateur__personne__prenom__unaccent__icontains=mot))
        ordering = request.query_params.get('ordering') or ''
        cles = {'timestamp': ('date_action',), 'utilisateur': ('utilisateur__personne__nom', 'utilisateur__personne__prenom')}
        if ordering.lstrip('-') in cles:
            descendant = ordering.startswith('-')
            queryset = queryset.order_by(*[('-' if descendant else '') + c for c in cles[ordering.lstrip('-')]], '-id' if descendant else 'id')
        if request.query_params.get('page') is None:
            return Response(self.get_serializer(queryset[:1000], many=True).data)
        try:
            taille = max(1, min(int(request.query_params.get('page_size') or 25), 200))
            numero = max(1, int(request.query_params.get('page')))
        except ValueError:
            raise serializers.ValidationError({'page': 'Numéro de page ou taille de page invalide.'})
        total = queryset.count()
        pages = max(1, -(-total // taille))
        numero = min(numero, pages)
        return Response({'count': total, 'page': numero, 'page_size': taille, 'pages': pages,
                         'results': self.get_serializer(queryset[(numero - 1) * taille: numero * taille], many=True).data})
