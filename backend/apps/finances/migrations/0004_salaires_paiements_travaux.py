import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Rémunérations générées par les travaux ; paiements numérotés, avec bénéficiaire, avance et dépense liée."""

    dependencies = [
        ('core', '0004_bloc_plantes_personne_bloc'),
        ('exploitation', '0003_activites_participants'),
        ('finances', '0003_alignement_frontend'),
    ]

    operations = [
        # Une personne peut avoir plusieurs rémunérations par mois (une par travail)
        migrations.RemoveConstraint(model_name='salaire', name='uniq_salaire_personne_periode'),
        migrations.AddField(
            model_name='salaire',
            name='travail',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                       related_name='remuneration', to='exploitation.travail'),
        ),
        migrations.AddField(
            model_name='salaire',
            name='bloc',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='salaires', to='core.bloc'),
        ),
        migrations.AddField(
            model_name='salaire',
            name='libelle',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='salaire',
            name='annulee',
            field=models.BooleanField(default=False),
        ),
        # Numéro sans contrainte d'unicité le temps de numéroter les paiements existants (contrainte en 0006)
        migrations.AddField(
            model_name='paiementsalaire',
            name='numero',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='paiementsalaire',
            name='beneficiaire',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='paiements_recus', to='core.personne'),
        ),
        migrations.AddField(
            model_name='paiementsalaire',
            name='est_avance',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='paiementsalaire',
            name='depense',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                       related_name='paiement_salaire', to='finances.depense'),
        ),
    ]
