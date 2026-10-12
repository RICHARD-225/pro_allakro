"""Outils partagés : codes automatiques, périodes mensuelles, normalisation des textes."""
import calendar
import re
import unicodedata
from datetime import date

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.utils import timezone


def next_code(model, field, prefix, width=3):
    """Prochain code d'une séquence : BLC-001, BLC-002... (les codes hors format sont ignorés)."""
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    max_n = 0
    for value in model.objects.filter(**{f"{field}__startswith": prefix}).values_list(field, flat=True):
        match = pattern.match(value or "")
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"{prefix}{max_n + 1:0{width}d}"


class AutoCodeMixin(models.Model):
    """Attribue automatiquement un code unique à la création (réessaie en cas de collision concurrente)."""

    code_field = "code"
    code_prefix = ""
    code_width = 3

    class Meta:
        abstract = True

    @classmethod
    def preview_code(cls):
        return next_code(cls, cls.code_field, cls.code_prefix, cls.code_width)

    def save(self, *args, **kwargs):
        if getattr(self, self.code_field):
            return super().save(*args, **kwargs)
        for attempt in range(5):
            setattr(self, self.code_field, self.preview_code())
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError as exc:
                setattr(self, self.code_field, "")
                # On ne réessaie que si le conflit porte sur le code (pas sur une autre contrainte d'unicité)
                if attempt == 4 or self.code_field not in str(exc):
                    raise


PERIODE_RE = re.compile(r"^(\d{4})-(\d{2})$")


def parse_periode(value):
    """'2025-09' -> (date(2025, 9, 1), date(2025, 9, 30))."""
    match = PERIODE_RE.match(str(value or ""))
    if not match:
        raise ValidationError("Période invalide (format attendu : AAAA-MM).")
    year, month = int(match.group(1)), int(match.group(2))
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        raise ValidationError("Période invalide.")
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def parse_date_filtre(valeur):
    """Date `AAAA-MM-JJ` d'un paramètre d'URL (None si absent) ; ValueError si le format est faux."""
    return date.fromisoformat(valeur) if valeur else None


def periode_of(value):
    return value.strftime("%Y-%m") if value else None


def periode_courante():
    """Mois en cours (AAAA-MM) : valeur par défaut des périodes."""
    return timezone.localdate().strftime("%Y-%m")


def shift_periode(periode, months):
    debut, _ = parse_periode(periode)
    index = debut.year * 12 + debut.month - 1 + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


ESPACES_RE = re.compile(r"\s+")


def normaliser_espaces(texte):
    """« Chef  de   chantier » -> « Chef de chantier »."""
    return ESPACES_RE.sub(" ", str(texte or "")).strip()


def normaliser_libelle(texte):
    """Espaces normalisés ; un texte tout en majuscules ou tout en minuscules prend une majuscule initiale."""
    texte = normaliser_espaces(texte)
    if texte.isupper() or texte.islower():
        texte = texte.lower()
    return texte[:1].upper() + texte[1:]


def normaliser_telephone(texte):
    """« 07 01-23.45 67 » -> « 0701234567 » (chiffres et + uniquement)."""
    return re.sub(r"[^0-9+]", "", str(texte or ""))


def cle_comparaison(texte):
    """Clé de comparaison insensible à la casse, aux accents et aux espaces multiples."""
    decompose = unicodedata.normalize("NFKD", normaliser_espaces(texte))
    return "".join(c for c in decompose if not unicodedata.combining(c)).upper()


# --- Montant en lettres (reçus PDF) : « Douze mille cinq cents francs CFA » ---
_UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize",
           "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
_DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"]


def _moins_de_cent(n, final):
    if n < 20:
        return _UNITES[n]
    d, u = divmod(n, 10)
    if d < 7:
        if u == 0:
            return _DIZAINES[d]
        return f"{_DIZAINES[d]} et un" if u == 1 else f"{_DIZAINES[d]}-{_UNITES[u]}"
    if d == 7:
        return "soixante et onze" if u == 1 else f"soixante-{_UNITES[10 + u]}"
    if d == 8:
        return ("quatre-vingts" if final else "quatre-vingt") if u == 0 else f"quatre-vingt-{_UNITES[u]}"
    return f"quatre-vingt-{_UNITES[10 + u]}"


def _moins_de_mille(n, final):
    c, r = divmod(n, 100)
    texte = ""
    if c:
        texte = "cent" if c == 1 else f"{_UNITES[c]} cent"
        if r == 0 and c > 1 and final:
            texte += "s"
    if r:
        texte += (" " if texte else "") + _moins_de_cent(r, final)
    return texte


def nombre_en_lettres(valeur):
    reste = int(abs(valeur or 0))
    if reste == 0:
        return "zéro"
    morceaux = []
    for seuil, nom in ((10 ** 9, "milliard"), (10 ** 6, "million")):
        q, reste = divmod(reste, seuil)
        if q:
            morceaux.append(f"{_moins_de_mille(q, False)} {nom}{'s' if q > 1 else ''}")
    milliers, reste = divmod(reste, 1000)
    if milliers:
        morceaux.append("mille" if milliers == 1 else f"{_moins_de_mille(milliers, False)} mille")
    if reste:
        morceaux.append(_moins_de_mille(reste, True))
    return " ".join(morceaux)


def montant_en_lettres(valeur):
    entier = int(abs(valeur or 0))
    texte = nombre_en_lettres(entier)
    de = "de " if entier >= 10 ** 6 and entier % 10 ** 6 == 0 else ""
    return f"{texte[:1].upper()}{texte[1:]} {de}{'francs' if entier > 1 else 'franc'} CFA"

