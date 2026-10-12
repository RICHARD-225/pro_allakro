import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Nombre de plantes d'un bloc ; bloc d'affectation d'une personne."""

    dependencies = [
        ('core', '0003_alignement_frontend'),
    ]

    operations = [
        migrations.AddField(
            model_name='bloc',
            name='nombre_plantes',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='personne',
            name='bloc',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='personnes', to='core.bloc'),
        ),
    ]
