from rest_framework.permissions import BasePermission


class IsBigBoss(BasePermission):
    message = "Action réservée au Big Boss."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_big_boss', False))


def forcer_perimetre(request, campement_id=None, bloc_id=None):
    """
    Périmètre d'un tableau de bord ou d'un rapport. Le Big Boss choisit librement. Un superviseur est limité à son campement :
    un campement ou un bloc d'un autre campement est refusé (403) ; sans choix, son campement est appliqué.
    """
    from rest_framework import exceptions

    from apps.core.models import Bloc

    ids = request.user.campements_autorises()
    if ids is None:
        return campement_id, bloc_id
    if not ids:
        raise exceptions.PermissionDenied("Aucun campement ne vous est affecté : contactez le Big Boss.")
    # Un superviseur peut gérer plusieurs campements : il choisit parmi les siens ; sans choix, le premier (par nom)
    autorises = {str(i) for i in ids}
    if bloc_id:
        if not str(bloc_id).isdigit() or not Bloc.objects.filter(pk=bloc_id, campement_id__in=ids).exists():
            raise exceptions.PermissionDenied("Ce bloc ne se trouve pas dans vos campements.")
        if campement_id and str(campement_id) not in autorises:
            raise exceptions.PermissionDenied("Ce campement n'est pas le vôtre.")
        return campement_id, bloc_id
    if campement_id and str(campement_id) not in autorises:
        raise exceptions.PermissionDenied("Ce campement n'est pas le vôtre.")
    return str(campement_id or ids[0]), bloc_id
