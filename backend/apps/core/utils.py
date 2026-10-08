"""Outils partagés : codes automatiques, périodes mensuelles."""
import calendar
import re
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
            except IntegrityError:
                setattr(self, self.code_field, "")
                if attempt == 4:
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


def periode_of(value):
    return value.strftime("%Y-%m") if value else None


def periode_courante():
    """Mois en cours (AAAA-MM) : valeur par défaut des périodes."""
    return timezone.localdate().strftime("%Y-%m")


def shift_periode(periode, months):
    debut, _ = parse_periode(periode)
    index = debut.year * 12 + debut.month - 1 + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"
