import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):
    """Unicité garantie par PostgreSQL : personne (nom + prénom), téléphone, fonction (sans tenir compte des majuscules)."""

    dependencies = [
        ('core', '0005_reprise_personnes_fonctions'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='fonction',
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower('libelle'),
                                               name='uniq_fonction_libelle_insensible'),
        ),
        migrations.AddConstraint(
            model_name='personne',
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower('nom'),
                                               django.db.models.functions.text.Lower('prenom'),
                                               name='uniq_personne_nom_prenom'),
        ),
        migrations.AddConstraint(
            model_name='personne',
            constraint=models.UniqueConstraint(
                models.Func(models.F('telephone'), models.Value('[^0-9+]'), models.Value(''), models.Value('g'),
                            function='REGEXP_REPLACE', output_field=models.CharField()),
                condition=models.Q(('telephone', ''), _negated=True), name='uniq_personne_telephone'),
        ),
    ]
