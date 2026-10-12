from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):
    """Extension PostgreSQL « unaccent » : la recherche côté serveur ignore les accents (« Sékou » trouve « sekou »)."""

    dependencies = [('core', '0007_contraintes_superficie')]
    operations = [UnaccentExtension()]
