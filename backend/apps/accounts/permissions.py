from rest_framework.permissions import BasePermission


class IsBigBoss(BasePermission):
    message = "Action réservée au Big Boss."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_big_boss', False))
