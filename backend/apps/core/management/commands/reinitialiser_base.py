"""
Remise à zéro propre de la base : supprime toutes les données de test et recharge un jeu COHÉRENT et réduit
(3 lignes pour chaque élément), en conservant les comptes utilisateurs (et la personne de chaque compte).

    python manage.py reinitialiser_base --confirmer

⚠ Commande destructive : sauvegarder la base avant (`pg_dump`). Les données passent par les serializers de l'API
(mêmes validations et mêmes calculs que l'application) ; le contrôle de cohérence est lancé à la fin.
Le scénario est expliqué dans `ALLAKRO_DOC.md` (partie 3.14).
"""
from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import RoleUtilisateur, Utilisateur
from apps.achats.serializers import AchatParticulierSerializer
from apps.core.management.commands.seed_allakro import MODELES_A_VIDER
from apps.core.models import Bloc, Campement, Personne, Plantation
from apps.core.serializers import BlocSerializer, CampementSerializer, PersonneSerializer, PlantationSerializer
from apps.exploitation.activites import installer_activites
from apps.exploitation.models import TypeTravail
from apps.exploitation.serializers import TravailSerializer
from apps.finances.models import CategorieDepense, Salaire
from apps.finances.serializers import CategorieDepenseSerializer, DepenseSerializer, PaiementSalaireSerializer
from apps.stock.serializers import MouvementStockSerializer, ProduitSerializer

# On garde les comptes : tout le reste est vidé
A_VIDER = [m for m in MODELES_A_VIDER if m not in (Utilisateur, RoleUtilisateur)]


class Command(BaseCommand):
    help = "Supprime les données de test et recharge un jeu cohérent (3 lignes par élément) ; les comptes sont conservés."

    def add_arguments(self, parser):
        parser.add_argument('--confirmer', action='store_true', help='Obligatoire : confirme la suppression des données métier.')

    def creer(self, serializer_class, data, instance=None):
        serializer = serializer_class(instance=instance, data=data, partial=instance is not None)
        if not serializer.is_valid():
            raise CommandError(f"{serializer_class.__name__} invalide : {serializer.errors}\nDonnées : {data}")
        return serializer.save()

    def handle(self, *args, confirmer=False, **options):
        if not confirmer:
            raise CommandError("Commande destructive : elle efface les données métier. Sauvegardez la base puis relancez avec --confirmer.")
        with transaction.atomic():
            comptes = list(Utilisateur.objects.select_related('personne', 'role').order_by('id'))
            if not comptes:
                raise CommandError("Aucun compte utilisateur : la base serait inutilisable. Créez d'abord un compte.")
            self.vider([u.personne_id for u in comptes])
            self.charger(comptes)
        self.stdout.write('Contrôle de cohérence…')
        call_command('verifier_coherence', stdout=self.stdout)

    def vider(self, ids_comptes):
        self.stdout.write('Suppression des données de test (les comptes sont conservés)…')
        Personne.objects.update(bloc=None, campement=None)  # casse le cycle personne <-> campement (responsable) avant les suppressions
        for model in A_VIDER:
            model.objects.all().delete()
        Bloc.objects.all().delete()
        Campement.objects.all().delete()
        Personne.objects.exclude(pk__in=ids_comptes).delete()
        Plantation.objects.all().delete()

    def charger(self, comptes):
        c = self.creer
        aujourdhui = timezone.localdate()
        j = lambda decalage: (aujourdhui + timedelta(days=decalage)).isoformat()  # noqa: E731

        # --- Exploitation : 3 plantations, 3 campements, 3 blocs (un par campement) ---
        plantations = [c(PlantationSerializer, {'nom': nom, 'localisation': "Côte d'Ivoire"})
                       for nom, superficie in (('ALLAKRO Nord', 1250), ('ALLAKRO Centre', 750), ('ALLAKRO Sud', 980))]
        # Un campement a toujours un responsable : un compte existant (le premier) au départ, réparti ensuite entre les comptes
        premier = comptes[0].personne
        campements = [c(CampementSerializer, {'nom': nom, 'plantation_id': plantation.pk, 'responsable_id': premier.pk})
                      for (nom, superficie), plantation in zip((('Campement Nord', 450), ('Campement Centre', 320), ('Campement Sud', 380)), plantations)]
        # Densité : environ 143 plants à l'hectare (palmier) ou 550 (hévéa)
        blocs = [c(BlocSerializer, {'nom': nom, 'campement_id': campement.pk, 'superficie': superficie, 'nombre_plantes': superficie * densite})
                 for (nom, superficie, densite), campement in zip((('Bloc A1', 45, 143), ('Bloc B1', 48, 550), ('Bloc C1', 36, 550)), campements)]
        a1, b1, c1 = blocs

        # --- Personnel : 3 personnes de terrain ; les personnes des comptes sont rattachées au premier bloc ---
        for compte in comptes:
            fonction = 'Direction' if compte.role.code == RoleUtilisateur.BIG_BOSS else 'Superviseur'
            c(PersonneSerializer, {'bloc_id': a1.pk, 'fonction_libelle': fonction}, instance=Personne.objects.get(pk=compte.personne_id))
        sekou = c(PersonneSerializer, {'nom': 'Diabaté', 'prenom': 'Sékou', 'telephone': '07 02 34 56 78', 'fonction_libelle': "Chef d'équipe",
                                       'bloc_id': a1.pk, 'date_embauche': '2023-01-20'})
        aminata = c(PersonneSerializer, {'nom': 'Touré', 'prenom': 'Aminata', 'telephone': '07 04 56 78 90', 'fonction_libelle': 'Ouvrier agricole',
                                         'bloc_id': c1.pk, 'date_embauche': '2023-02-15'})
        moussa = c(PersonneSerializer, {'nom': 'Traoré', 'prenom': 'Moussa', 'telephone': '07 09 01 23 45', 'fonction_libelle': 'Saigneur',
                                        'bloc_id': b1.pk, 'date_embauche': '2023-01-30'})
        # Les responsables sont des comptes (superviseur ou Super admin) : répartis entre les comptes existants
        for i, campement in enumerate(campements):
            Campement.objects.filter(pk=campement.pk).update(responsable_id=comptes[(len(comptes) - 1 - i) % len(comptes)].personne_id)

        # --- Activités (liste officielle) et catégories de dépenses ---
        installer_activites(TypeTravail)
        activites = {t.libelle: t.pk for t in TypeTravail.objects.all()}
        categories = {libelle: c(CategorieDepenseSerializer, {'libelle': libelle}).pk for libelle in ('Carburant', 'Équipements', 'Entretien')}
        CategorieDepense.achat_particuliers()
        CategorieDepense.salaires()

        # --- Travaux (3) : une équipe payée en entier, un travail seul payé en partie, un travail en cours avec avance ---
        t1 = c(TravailSerializer, {'type_travail_id': activites['OUVERTURES'], 'bloc_id': a1.pk, 'date_travail': j(-25), 'date_fin': j(-20),
                                   'unite': 'ha', 'quantite': 10, 'prix_unitaire': 50000, 'personnes_ids': [sekou.pk, aminata.pk],
                                   'chef_id': sekou.pk, 'equipe_nom': 'Équipe Alpha'})
        t2 = c(TravailSerializer, {'type_travail_id': activites['SAIGNEE'], 'bloc_id': b1.pk, 'date_travail': j(-12), 'date_fin': j(-4),
                                   'unite': 'kg', 'quantite': 300, 'prix_unitaire': 250, 'personnes_ids': [moussa.pk]})
        c(TravailSerializer, {'type_travail_id': activites['PLANTING'], 'bloc_id': c1.pk, 'date_travail': j(-3), 'date_fin': j(7),
                              'unite': 'plantes', 'quantite': 1000, 'prix_unitaire': 150, 'personnes_ids': [aminata.pk],
                              'avance': {'montant': 50000, 'date': j(-3), 'type_paiement': 'ESPECES'}})

        # --- Paiements (3, avance comprise) ---
        c(PaiementSalaireSerializer, {'salaire_id': Salaire.objects.get(travail=t1).pk, 'montant': 500000, 'date': j(-19),
                                      'type_paiement': 'VIREMENT', 'reference': 'VIR-ALPHA-001', 'beneficiaire_id': sekou.pk})
        c(PaiementSalaireSerializer, {'salaire_id': Salaire.objects.get(travail=t2).pk, 'montant': 40000, 'date': j(-3),
                                      'type_paiement': 'MOBILE_MONEY', 'reference': 'OM-0001', 'observation': 'Acompte sur 300 kg'})

        # --- Dépenses saisies directement (3) ---
        for categorie, designation, montant, date, bloc in (
            ('Carburant', 'Gasoil tracteur', 85000, j(-18), a1), ('Équipements', 'Achat débroussailleuse', 180000, j(-9), b1),
            ('Entretien', 'Réparation pulvérisateur', 45000, j(-6), c1),
        ):
            c(DepenseSerializer, {'categorie_id': categories[categorie], 'designation': designation, 'montant_total': montant,
                                  'date': date, 'bloc_id': bloc.pk})

        # --- Stock : 3 produits, 3 mouvements (le troisième produit, sans mouvement, déclenche l'alerte de stock) ---
        herbicide = c(ProduitSerializer, {'nom': 'Herbicide', 'categorie': 'Phytosanitaire', 'unite': 'L', 'prix_unitaire': 15000, 'stock_minimum': 50})
        fongicide = c(ProduitSerializer, {'nom': 'Fongicide', 'categorie': 'Phytosanitaire', 'unite': 'L', 'prix_unitaire': 22000, 'stock_minimum': 40})
        c(ProduitSerializer, {'nom': 'Super Gros', 'categorie': 'Engrais', 'unite': 'kg', 'prix_unitaire': 1200, 'stock_minimum': 200})
        for produit, type_mouvement, quantite, date, motif, bloc in (
            (herbicide, 'ENTREE', 200, j(-20), 'Réception fournisseur', a1), (herbicide, 'SORTIE', 80, j(-10), 'Traitement Bloc B1', b1),
            (fongicide, 'ENTREE', 80, j(-15), 'Réception fongicide', b1),
        ):
            c(MouvementStockSerializer, {'produit_id': produit.pk, 'type_mouvement': type_mouvement, 'quantite': quantite,
                                         'date': date, 'motif': motif, 'bloc_id': bloc.pk})

        # --- Achats aux particuliers (3) : soldé, réglé en partie, réglé en partie ---
        for nom, telephone, produit, poids, prix, date, bloc, verse in (
            ("N'Guessan François", '07 21 23 45 67', 'Bois de chauffe', 100, 1250, j(-16), a1, 125000),
            ('Brou Émilie', '07 22 34 56 78', 'Régimes de palmier', 340, 250, j(-11), b1, 50000),
            ('Yapi Laurent', '07 23 45 67 89', 'Bois de chauffe', 48, 1250, j(-5), c1, 20000),
        ):
            c(AchatParticulierSerializer, {'particulier_nom': nom, 'particulier_telephone': telephone, 'designation': produit, 'poids': poids,
                                           'unite_poids': 'kg', 'prix_unitaire': prix, 'date_achat': date, 'bloc_id': bloc.pk,
                                           'montant_verse': verse})
        self.stdout.write(self.style.SUCCESS('Données propres chargées : 3 plantations, 3 campements, 3 blocs, 3 travaux (3 rémunérations, 3 paiements), '
                                             '3 dépenses saisies, 3 produits, 3 mouvements, 3 achats ; comptes conservés.'))
