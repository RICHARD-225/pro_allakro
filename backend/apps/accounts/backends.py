from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.hashers import check_password
from .models import Utilisateur

class CustomAuthBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = Utilisateur.objects.get(username=username)
            if check_password(password, user.password_hash) and user.actif:
                return user
        except Utilisateur.DoesNotExist:
            return None
        return None

    def get_user(self, user_id):
        try:
            return Utilisateur.objects.get(pk=user_id)
        except Utilisateur.DoesNotExist:
            return None
