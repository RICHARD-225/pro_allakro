from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('finances', '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='depense',
            name='statut',
            field=models.CharField(
                choices=[('NON_PAYEE', 'Non payée'), ('PARTIELLE', 'Partiellement payée'), ('PAYEE', 'Payée')],
                default='NON_PAYEE',
                max_length=15,
            ),
        ),
    ]
