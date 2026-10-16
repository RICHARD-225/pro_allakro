from rest_framework.permissions import BasePermission


class IsBigBoss(BasePermission):
    message = "Action réservée au Super admin."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_big_boss', False))


def forcer_perimetre(request, campement_id=None, bloc_id=None):
    """
    Périmètre d'un tableau de bord ou d'un rapport. Le Super admin choisit librement. Un superviseur est limité à son campement :
    un campement ou un bloc d'un autre campement est refusé (403) ; sans choix, son campement est appliqué.
    """
    from rest_framework import exceptions

    from apps.core.models import Bloc

    ids = request.user.campements_autorises()
    if ids is None:
        return campement_id, bloc_id
    if not ids:
        raise exceptions.PermissionDenied("Aucun campement ne vous est affecté : contactez le Super admin.")
    # Un responsable gère un ou plusieurs campements : il choisit l'un des siens ; sans choix, la vue est GLOBALE (tous ses campements)
    autorises = {str(i) for i in ids}
    if bloc_id:
        if not str(bloc_id).isdigit() or not Bloc.objects.filter(pk=bloc_id, campement_id__in=ids).exists():
            raise exceptions.PermissionDenied("Ce bloc ne se trouve pas dans vos campements.")
        if campement_id and str(campement_id) not in autorises:
            raise exceptions.PermissionDenied("Ce campement n'est pas le vôtre.")
        return campement_id, bloc_id
    if campement_id and str(campement_id) not in autorises:
        raise exceptions.PermissionDenied("Ce campement n'est pas le vôtre.")
    if campement_id:
        return str(campement_id), bloc_id
    return (str(ids[0]) if len(ids) == 1 else list(ids)), bloc_id
