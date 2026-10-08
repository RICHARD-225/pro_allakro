"""Règles métier du personnel : appartenance aux équipes et affectation des équipes aux blocs (avec historique)."""
from django.db.models import Prefetch
from django.utils import timezone

from .models import AffectationEquipeBloc, Equipe, MembreEquipe, Personne, PersonneFonction


def personnes_queryset():
    """Personnes avec fonction, équipe et bloc actuels préchargés (évite les requêtes en boucle)."""
    return Personne.objects.select_related('campement').prefetch_related(
        Prefetch(
            'participations_equipes',
            queryset=MembreEquipe.objects.filter(date_fin__isnull=True).select_related('equipe'),
            to_attr='memberships_actuels',
        ),
        Prefetch(
            'memberships_actuels__equipe__affectations_blocs',
            queryset=AffectationEquipeBloc.objects.filter(date_fin__isnull=True).select_related('bloc__campement'),
            to_attr='affectations_actuelles',
        ),
        Prefetch(
            'fonctions',
            queryset=PersonneFonction.objects.filter(date_fin__isnull=True, principal=True).select_related('fonction'),
            to_attr='fonctions_actuelles',
        ),
    )


def equipes_queryset():
    return Equipe.objects.select_related('chef').prefetch_related(
        Prefetch(
            'affectations_blocs',
            queryset=AffectationEquipeBloc.objects.filter(date_fin__isnull=True).select_related('bloc__campement'),
            to_attr='affectations_actuelles',
        ),
        Prefetch('membres', queryset=MembreEquipe.objects.filter(date_fin__isnull=True), to_attr='membres_en_cours'),
    )


def bloc_de_personne(personne):
    """Bloc actuel d'une personne = bloc affecté à son équipe actuelle."""
    membership = personne.membership_actuel()
    if not membership:
        return None
    affectation = membership.equipe.affectation_actuelle()
    return affectation.bloc if affectation else None


def oublier_cache(obj, *attrs):
    for attr in attrs:
        obj.__dict__.pop(attr, None)


def definir_fonction(personne, fonction, date=None):
    """Change la fonction principale en conservant l'historique."""
    date = date or timezone.localdate()
    actuelle = personne.fonction_actuelle()
    if actuelle and actuelle.pk == fonction.pk:
        return
    PersonneFonction.objects.filter(personne=personne, principal=True, date_fin__isnull=True).update(date_fin=date)
    PersonneFonction.objects.create(personne=personne, fonction=fonction, principal=True, date_debut=date)
    oublier_cache(personne, 'fonctions_actuelles')


def retirer_de_son_equipe(personne, date=None):
    """Clôture l'appartenance actuelle ; si la personne était chef, l'équipe n'a plus de chef."""
    date = date or timezone.localdate()
    MembreEquipe.objects.filter(personne=personne, date_fin__isnull=True).update(date_fin=date)
    Equipe.objects.filter(chef=personne).update(chef=None)
    oublier_cache(personne, 'memberships_actuels')


def affecter_a_equipe(personne, equipe, date=None):
    """Une personne n'appartient qu'à une équipe à la fois ; elle prend le campement de l'équipe."""
    date = date or timezone.localdate()
    actuel = personne.membership_actuel()
    if actuel and actuel.equipe_id == equipe.pk:
        return
    MembreEquipe.objects.filter(personne=personne, date_fin__isnull=True).update(date_fin=date)
    Equipe.objects.filter(chef=personne).exclude(pk=equipe.pk).update(chef=None)
    MembreEquipe.objects.create(personne=personne, equipe=equipe, date_debut=date)
    affectation = equipe.affectation_actuelle()
    if affectation and personne.campement_id != affectation.bloc.campement_id:
        personne.campement_id = affectation.bloc.campement_id
        personne.save(update_fields=['campement', 'date_modification'])
    oublier_cache(personne, 'memberships_actuels')


def affecter_bloc(equipe, bloc, date=None):
    """Affecte l'équipe à un bloc (l'affectation précédente est clôturée)."""
    date = date or timezone.localdate()
    actuelle = equipe.affectation_actuelle()
    if actuelle and actuelle.bloc_id == bloc.pk:
        return
    AffectationEquipeBloc.objects.filter(equipe=equipe, date_fin__isnull=True).update(date_fin=date)
    AffectationEquipeBloc.objects.create(equipe=equipe, bloc=bloc, date_debut=date, responsable=True)
    # Les membres suivent leur équipe dans le campement du bloc
    Personne.objects.filter(
        participations_equipes__equipe=equipe, participations_equipes__date_fin__isnull=True,
    ).update(campement=bloc.campement)
    oublier_cache(equipe, 'affectations_actuelles')


def liberer_bloc(equipe, date=None):
    AffectationEquipeBloc.objects.filter(equipe=equipe, date_fin__isnull=True).update(date_fin=date or timezone.localdate())
    oublier_cache(equipe, 'affectations_actuelles')


def definir_membres(equipe, personnes, date=None):
    """Membres actuels de l'équipe = `personnes` (les autres sont retirés, l'historique est conservé)."""
    date = date or timezone.localdate()
    ids = {p.pk for p in personnes}
    sortants = MembreEquipe.objects.filter(equipe=equipe, date_fin__isnull=True).exclude(personne_id__in=ids)
    Equipe.objects.filter(pk=equipe.pk, chef_id__in=sortants.values('personne_id')).update(chef=None)
    sortants.update(date_fin=date)
    for personne in personnes:
        affecter_a_equipe(personne, equipe, date)
    oublier_cache(equipe, 'membres_en_cours')
