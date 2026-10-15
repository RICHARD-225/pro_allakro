"""Un campement a toujours un responsable : reprise des campements sans responsable valide, puis colonne obligatoire."""
import django.db.models.deletion
from django.db import migrations, models


def reprendre(apps, schema_editor):
    Campement = apps.get_model('core', 'Campement')
    Utilisateur = apps.get_model('accounts', 'Utilisateur')
    valides = set(Utilisateur.objects.filter(actif=True, role__code__in=('big_boss', 'superviseur')).values_list('personne_id', flat=True))
    a_reprendre = [c for c in Campement.objects.all() if c.responsable_id is None or c.responsable_id not in valides]
    if not a_reprendre:
        return
    boss = Utilisateur.objects.filter(actif=True, role__code='big_boss').order_by('id').first()
    if boss is None:
        raise RuntimeError("Des campements n'ont pas de responsable valide et aucun compte Big Boss actif n'existe pour les reprendre : "
                           "créez d'abord un compte Big Boss.")
    Personne = apps.get_model('core', 'Personne')
    for campement in a_reprendre:
        if campement.responsable_id:
            ancien = Personne.objects.get(pk=campement.responsable_id)
            note = f"Ancien responsable (sans compte utilisateur) : {ancien.prenom} {ancien.nom}."
            campement.description = f"{campement.description}\n{note}".strip()
        campement.responsable_id = boss.personne_id
        campement.save(update_fields=['responsable', 'description'])


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0008_extension_unaccent'),
        ('accounts', '0005_reinitialisation_notifications'),
    ]

    operations = [
        migrations.RunPython(reprendre, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='campement',
            name='responsable',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='campements_responsable',
                                    to='core.personne', verbose_name='Responsable'),
        ),
    ]
