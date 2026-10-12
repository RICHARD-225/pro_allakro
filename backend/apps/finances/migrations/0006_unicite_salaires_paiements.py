from django.db import migrations, models


class Migration(migrations.Migration):
    """Numéro de paiement unique ; une seule rémunération manuelle par personne et par mois."""

    dependencies = [
        ('finances', '0005_reprise_salaires_paiements'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paiementsalaire',
            name='numero',
            field=models.CharField(blank=True, max_length=20, unique=True),
        ),
        migrations.AddConstraint(
            model_name='salaire',
            constraint=models.UniqueConstraint(condition=models.Q(('travail__isnull', True)),
                                               fields=('personne', 'date_debut'),
                                               name='uniq_salaire_manuel_personne_periode'),
        ),
    ]
