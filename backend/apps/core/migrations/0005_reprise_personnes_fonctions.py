"""
Reprise des données avant les contraintes d'unicité :
- chaque personne est affectée au bloc actuel de son équipe (son campement suit le bloc) ;
- noms, prénoms et téléphones sans espaces superflus ;
- fonctions normalisées, variantes d'écriture fusionnées (les personnes gardent leur fonction).
"""
import re
from collections import defaultdict

from django.db import migrations


def espaces(texte):
    return re.sub(r'\s+', ' ', texte or '').strip()


def libelle_normalise(texte):
    texte = espaces(texte)
    if texte.isupper() or texte.islower():
        texte = texte.lower()
    return texte[:1].upper() + texte[1:]


def reprendre(apps, schema_editor):
    Bloc = apps.get_model('core', 'Bloc')
    Personne = apps.get_model('core', 'Personne')
    MembreEquipe = apps.get_model('core', 'MembreEquipe')
    AffectationEquipeBloc = apps.get_model('core', 'AffectationEquipeBloc')
    Fonction = apps.get_model('core', 'Fonction')
    PersonneFonction = apps.get_model('core', 'PersonneFonction')

    blocs_des_equipes = {a.equipe_id: a.bloc_id for a in AffectationEquipeBloc.objects.filter(date_fin__isnull=True)}
    equipe_des_personnes = {m.personne_id: m.equipe_id for m in MembreEquipe.objects.filter(date_fin__isnull=True)}
    campements = dict(Bloc.objects.values_list('id', 'campement_id'))
    for personne in Personne.objects.all():
        personne.nom, personne.prenom = espaces(personne.nom), espaces(personne.prenom)
        personne.telephone = espaces(personne.telephone)
        bloc_id = personne.bloc_id or blocs_des_equipes.get(equipe_des_personnes.get(personne.pk))
        if bloc_id:
            personne.bloc_id, personne.campement_id = bloc_id, campements[bloc_id]
        personne.save(update_fields=['nom', 'prenom', 'telephone', 'bloc', 'campement'])

    # Une personne ne doit exister qu'une fois : on s'arrête si des doublons subsistent (à corriger à la main)
    noms, telephones = defaultdict(list), defaultdict(list)
    for personne in Personne.objects.all():
        noms[(personne.nom.lower(), personne.prenom.lower())].append(personne.matricule)
        if personne.telephone:
            telephones[re.sub(r'[^0-9+]', '', personne.telephone)].append(personne.matricule)
    doublons = [m for m in noms.values() if len(m) > 1] + [m for m in telephones.values() if len(m) > 1]
    if doublons:
        raise RuntimeError(f"Personnes ou téléphones en double à corriger avant la migration (matricules) : {doublons}")

    groupes = defaultdict(list)
    for fonction in Fonction.objects.order_by('id'):
        groupes[libelle_normalise(fonction.libelle).lower()].append(fonction)
    for fonctions in groupes.values():
        cible = libelle_normalise(fonctions[0].libelle)
        gardee = next((f for f in fonctions if f.libelle == cible), fonctions[0])
        for doublon in fonctions:
            if doublon.pk != gardee.pk:
                PersonneFonction.objects.filter(fonction=doublon).update(fonction=gardee)
                doublon.delete()
        if gardee.libelle != cible:
            gardee.libelle = cible
            gardee.save(update_fields=['libelle'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_bloc_plantes_personne_bloc'),
    ]

    operations = [
        migrations.RunPython(reprendre, migrations.RunPython.noop),
    ]
