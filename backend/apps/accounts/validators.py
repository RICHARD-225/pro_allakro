from django.core.exceptions import ValidationError


class ComplexiteMotDePasseValidator:
    """Au moins une minuscule, une majuscule et un chiffre (la longueur minimale et les mots de passe courants sont vérifiés à part)."""

    def validate(self, password, user=None):
        manques = []
        if not any(c.islower() for c in password):
            manques.append('une minuscule')
        if not any(c.isupper() for c in password):
            manques.append('une majuscule')
        if not any(c.isdigit() for c in password):
            manques.append('un chiffre')
        if manques:
            raise ValidationError(f"Le mot de passe doit contenir au moins {', '.join(manques)}.", code='mot_de_passe_simple')

    def get_help_text(self):
        return 'Le mot de passe doit contenir 10 caractères au minimum, dont une minuscule, une majuscule et un chiffre.'
