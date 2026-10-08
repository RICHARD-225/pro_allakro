"""
Charge un jeu de données réaliste dans la base (PostgreSQL).

    python manage.py seed_allakro            # base vide uniquement
    python manage.py seed_allakro --reset    # efface les données métier puis recharge

Toutes les données passent par les serializers de l'API : mêmes validations et mêmes calculs
(codes automatiques, montants, dépenses issues des achats, soldes des rémunérations...).
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Journal, RoleUtilisateur, Utilisateur
from apps.accounts.serializers import UtilisateurSerializer
from apps.achats.models import AchatParticulier, PaiementAchat, Particulier
from apps.achats.serializers import AchatParticulierSerializer
from apps.core.models import (
    AffectationEquipeBloc, Bloc, Campement, Equipe, Fonction, MembreEquipe, Personne, PersonneFonction, Plantation,
)
from apps.core.serializers import (
    BlocSerializer, CampementSerializer, EquipeSerializer, FonctionSerializer, PersonneSerializer, PlantationSerializer,
)
from apps.exploitation.models import Travail, TravailParticipant, TypeTravail
from apps.exploitation.serializers import TravailSerializer, TypeTravailSerializer
from apps.finances.models import (
    BilanMensuel, CategorieDepense, Depense, LigneSalaire, PaiementSalaire, Prevision, RegleRemuneration, Salaire, Tiers,
)
from apps.finances.serializers import (
    CategorieDepenseSerializer, DepenseSerializer, PaiementGroupeSerializer, PaiementSalaireSerializer,
    PrevisionSerializer, SalaireSerializer,
)
from apps.stock.models import MouvementStock, Produit
from apps.stock.serializers import MouvementStockSerializer, ProduitSerializer

# Ordre de suppression compatible avec les clés étrangères protégées
MODELES_A_VIDER = [
    Journal, Utilisateur, RoleUtilisateur,
    PaiementAchat, AchatParticulier, Particulier,
    MouvementStock, Produit,
    PaiementSalaire, LigneSalaire, Salaire, RegleRemuneration, Prevision, BilanMensuel, Depense, CategorieDepense, Tiers,
    TravailParticipant, Travail, TypeTravail,
    MembreEquipe, AffectationEquipeBloc, Equipe, PersonneFonction, Fonction,
]


class Command(BaseCommand):
    help = "Charge des données de démonstration réalistes (validées par l'API) dans la base."

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Efface les données métier existantes avant le chargement.')
        parser.add_argument('--admin-password', default='Allakro@2025', help='Mot de passe du compte Big Boss.')
        parser.add_argument('--superviseur-password', default='Superviseur@2025', help='Mot de passe du compte superviseur.')

    def creer(self, serializer_class, data, instance=None, **context):
        serializer = serializer_class(instance=instance, data=data, context=context, partial=instance is not None)
        if not serializer.is_valid():
            raise CommandError(f"{serializer_class.__name__} invalide : {serializer.errors}\nDonnées : {data}")
        return serializer.save()

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            self.vider()
        elif Plantation.objects.exists() or Utilisateur.objects.exists():
            raise CommandError('La base contient déjà des données. Utilisez --reset pour tout recharger.')

        self.stdout.write('Chargement des données...')
        ids = {}
        c = self.creer

        # --- Exploitation : plantations, campements, blocs ---
        for key, nom, superficie in (('P1', 'ALLAKRO Nord', 1250), ('P2', 'ALLAKRO Sud', 980), ('P3', 'ALLAKRO Centre', 750)):
            ids[key] = c(PlantationSerializer, {'nom': nom, 'localisation': "Côte d'Ivoire", 'superficie': superficie}).pk
        campements = (('C1', 'Campement Nord', 'P1', 450), ('C2', 'Campement Sud', 'P2', 380),
                      ('C3', 'Campement Central', 'P3', 320), ('C4', 'Campement Est', 'P1', 280),
                      ('C5', 'Campement Ouest', 'P2', 220))
        for key, nom, plantation, superficie in campements:
            ids[key] = c(CampementSerializer, {'nom': nom, 'plantation_id': ids[plantation], 'superficie': superficie}).pk
        blocs = (('B1', 'Bloc A1', 'C1', 45), ('B2', 'Bloc A2', 'C1', 38), ('B3', 'Bloc A3', 'C1', 52),
                 ('B4', 'Bloc B1', 'C2', 41), ('B5', 'Bloc B2', 'C2', 36), ('B6', 'Bloc C1', 'C3', 48),
                 ('B7', 'Bloc C2', 'C3', 33), ('B8', 'Bloc D1', 'C4', 29), ('B9', 'Bloc D2', 'C4', 31),
                 ('B10', 'Bloc E1', 'C5', 25))
        for key, nom, campement, superficie in blocs:
            ids[key] = c(BlocSerializer, {'nom': nom, 'campement_id': ids[campement], 'superficie': superficie}).pk

        # --- Personnel ---
        for key, libelle in (('F_CC', 'Chef de campement'), ('F_CE', "Chef d'équipe"), ('F_OA', 'Ouvrier agricole'),
                             ('F_TR', 'Tractoriste'), ('F_PU', 'Pulvérisateur'), ('F_MA', 'Manœuvre'), ('F_DI', 'Direction')):
            ids[key] = c(FonctionSerializer, {'libelle': libelle}).pk

        personnes = (
            ('Kouassi', 'Jean', '07 01 23 45 67', 'F_CC', 'C1', '2023-01-15'),
            ('Diabaté', 'Sékou', '07 02 34 56 78', 'F_OA', 'C1', '2023-01-20'),
            ('Bamba', 'Ibrahim', '07 03 45 67 89', 'F_OA', 'C1', '2023-02-01'),
            ('Touré', 'Aminata', '07 04 56 78 90', 'F_MA', 'C1', '2023-02-15'),
            ('Koné', 'Adama', '07 05 67 89 01', 'F_CE', 'C1', '2023-01-25'),
            ('Cissé', 'Mariam', '07 06 78 90 12', 'F_PU', 'C1', '2023-03-01'),
            ('Yao', 'Kouassi', '07 07 89 01 23', 'F_OA', 'C1', '2023-03-10'),
            ('Brou', 'Franck', '07 08 90 12 34', 'F_TR', 'C1', '2023-04-01'),
            ('Traoré', 'Moussa', '07 09 01 23 45', 'F_CC', 'C2', '2023-01-30'),
            ('Diallo', 'Fatou', '07 10 12 34 56', 'F_OA', 'C2', '2023-02-20'),
            ('Sangaré', 'Ousmane', '07 11 23 45 67', 'F_PU', 'C2', '2023-03-15'),
            ('Coulibaly', 'Awa', '07 12 34 56 78', 'F_MA', 'C2', '2023-04-10'),
            ("N'Guessan", 'Brice', '07 13 45 67 89', 'F_CE', 'C3', '2023-02-05'),
            ('Ouattara', 'Lassina', '07 14 56 78 90', 'F_OA', 'C3', '2023-03-01'),
            ('Koffi', 'Marie', '07 15 67 89 01', 'F_PU', 'C3', '2023-04-15'),
            ('Ahoua', 'Christophe', '07 16 78 90 12', 'F_TR', 'C3', '2023-05-01'),
            ('Zadi', 'Paul', '07 17 89 01 23', 'F_CE', 'C4', '2023-03-20'),
            ('Bakayoko', 'Yacouba', '07 18 90 12 34', 'F_OA', 'C4', '2023-04-20'),
            ('Gnagne', 'Auguste', '07 19 01 23 45', 'F_MA', 'C4', '2023-05-10'),
            ('Tiémoko', 'Adama', '07 20 12 34 56', 'F_OA', 'C4', '2023-06-01'),
        )
        for i, (nom, prenom, tel, fonction, campement, embauche) in enumerate(personnes, start=1):
            ids[f'PERS{i}'] = c(PersonneSerializer, {
                'nom': nom, 'prenom': prenom, 'telephone': tel, 'fonction_id': ids[fonction],
                'campement_id': ids[campement], 'date_embauche': embauche,
            }).pk
        ids['ADMIN'] = c(PersonneSerializer, {'nom': 'ALLAKRO', 'prenom': 'Admin', 'fonction_id': ids['F_DI'],
                                              'campement_id': ids['C1'], 'date_embauche': '2023-01-01'}).pk

        equipes = (
            ('E1', 'Équipe Alpha', 'B1', 'PERS1', [1, 2, 3, 4]),
            ('E2', 'Équipe Bravo', 'B2', 'PERS5', [5, 6, 7, 8]),
            ('E3', 'Équipe Charlie', 'B4', 'PERS9', [9, 10, 11, 12]),
            ('E4', 'Équipe Delta', 'B6', 'PERS13', [13, 14, 15, 16]),
            ('E5', 'Équipe Echo', 'B8', 'PERS17', [17, 18, 19, 20]),
        )
        for key, nom, bloc, chef, membres in equipes:
            ids[key] = c(EquipeSerializer, {
                'nom': nom, 'bloc_id': ids[bloc], 'chef_id': ids[chef], 'membres_ids': [ids[f'PERS{m}'] for m in membres],
            }).pk

        for campement, responsable in (('C1', 'PERS1'), ('C2', 'PERS9'), ('C3', 'PERS13'), ('C4', 'PERS17'), ('C5', 'PERS9')):
            c(CampementSerializer, {'responsable_id': ids[responsable]}, instance=Campement.objects.get(pk=ids[campement]))

        # --- Travaux ---
        types = ('Ouverture', 'Rabattage', 'Plantation', 'Piquetage', 'Dégagement', 'Trouaison', 'Traitement', 'Nettoyage', 'Épandage')
        for libelle in types:
            ids[f'TT_{libelle}'] = c(TypeTravailSerializer, {'libelle': libelle, 'unite_par_defaut': 'ha'}).pk
        travaux = (
            ('Ouverture', 'B1', 'E1', '2025-09-01', 45, 5000, 'TERMINE'), ('Rabattage', 'B2', 'E2', '2025-09-03', 38, 5000, 'TERMINE'),
            ('Plantation', 'B3', 'E1', '2025-09-05', 52, 8000, 'EN_COURS'), ('Piquetage', 'B4', 'E3', '2025-09-08', 41, 4000, 'TERMINE'),
            ('Dégagement', 'B5', 'E3', '2025-09-10', 36, 4000, 'EN_COURS'), ('Trouaison', 'B6', 'E4', '2025-09-12', 48, 6000, 'EN_COURS'),
            ('Traitement', 'B7', 'E4', '2025-09-15', 33, 4000, 'PLANIFIE'), ('Nettoyage', 'B8', 'E5', '2025-09-18', 29, 3000, 'PLANIFIE'),
            ('Épandage', 'B1', 'E1', '2025-08-05', 45, 3000, 'TERMINE'), ('Ouverture', 'B2', 'E2', '2025-08-01', 38, 5000, 'TERMINE'),
            ('Rabattage', 'B3', 'E1', '2025-08-10', 52, 5000, 'TERMINE'), ('Plantation', 'B4', 'E3', '2025-08-15', 41, 8000, 'TERMINE'),
            ('Dégagement', 'B5', 'E3', '2025-08-20', 36, 4000, 'TERMINE'), ('Traitement', 'B6', 'E4', '2025-08-22', 48, 4000, 'TERMINE'),
            ('Nettoyage', 'B7', 'E4', '2025-07-05', 33, 3000, 'TERMINE'), ('Épandage', 'B8', 'E5', '2025-07-10', 29, 3000, 'TERMINE'),
            ('Ouverture', 'B1', 'E1', '2025-07-01', 45, 5000, 'TERMINE'), ('Trouaison', 'B2', 'E2', '2025-07-08', 38, 6000, 'TERMINE'),
        )
        for type_libelle, bloc, equipe, date, quantite, prix, statut in travaux:
            c(TravailSerializer, {
                'type_travail_id': ids[f'TT_{type_libelle}'], 'bloc_id': ids[bloc], 'equipe_id': ids[equipe],
                'date_travail': date, 'quantite': quantite, 'prix_unitaire': prix, 'statut': statut,
            })

        # --- Dépenses ---
        for libelle in ('Travaux agricoles', 'Produits phytosanitaires', 'Carburant', 'Équipements', 'Maintenance',
                        'Communication', 'Autres'):
            ids[f'CAT_{libelle}'] = c(CategorieDepenseSerializer, {'libelle': libelle}).pk
        ids['CAT_ACHAT'] = CategorieDepense.achat_particuliers().pk
        depenses = (
            ('Travaux agricoles', 'Ouverture Bloc A1', 225000, '2025-09-05', 'B1', 'PAYEE'),
            ('Carburant', 'Gasoil tracteur', 85000, '2025-09-07', 'B1', 'PAYEE'),
            ('Produits phytosanitaires', 'Herbicide Bloc A3', 120000, '2025-09-10', 'B3', 'PAYEE'),
            ('Travaux agricoles', 'Rabattage Bloc A2', 190000, '2025-09-08', 'B2', 'PAYEE'),
            ('Maintenance', 'Réparation pulvérisateur', 45000, '2025-09-12', 'B4', 'PAYEE'),
            ('Équipements', 'Achat débroussailleuse', 180000, '2025-09-15', 'B4', 'NON_PAYEE'),
            ('Travaux agricoles', 'Plantation Bloc A3', 416000, '2025-09-15', 'B3', 'PARTIELLE'),
            ('Carburant', 'Essence groupe électrogène', 60000, '2025-09-18', 'B6', 'PAYEE'),
            ('Communication', 'Crédit téléphone superviseurs', 25000, '2025-09-20', 'B6', 'PAYEE'),
            ('Travaux agricoles', 'Piquetage Bloc B1', 164000, '2025-09-12', 'B4', 'PAYEE'),
            ('Produits phytosanitaires', 'Fongicide Bloc B2', 95000, '2025-09-14', 'B5', 'PAYEE'),
            ('Travaux agricoles', 'Trouaison Bloc C1', 288000, '2025-09-20', 'B6', 'PARTIELLE'),
            ('Autres', 'Fournitures bureau', 15000, '2025-09-25', 'B6', 'PAYEE'),
            ('Travaux agricoles', 'Ouverture Bloc A2', 190000, '2025-08-06', 'B2', 'PAYEE'),
            ('Carburant', 'Gasoil mois août', 110000, '2025-08-15', 'B1', 'PAYEE'),
            ('Produits phytosanitaires', 'Insecticide Bloc A1', 75000, '2025-08-10', 'B1', 'PAYEE'),
            ('Travaux agricoles', 'Plantation Bloc B1', 328000, '2025-08-25', 'B4', 'PAYEE'),
            ('Maintenance', 'Entretien tracteur', 70000, '2025-08-18', 'B4', 'PAYEE'),
            ('Travaux agricoles', 'Ouverture Bloc A1', 225000, '2025-07-06', 'B1', 'PAYEE'),
            ('Carburant', 'Gasoil juillet', 95000, '2025-07-15', 'B1', 'PAYEE'),
            ('Équipements', 'Achat pioches', 95000, '2025-07-10', 'B6', 'PAYEE'),
            ('Travaux agricoles', 'Trouaison Bloc A2', 228000, '2025-07-15', 'B2', 'PAYEE'),
        )
        for categorie, designation, montant, date, bloc, statut in depenses:
            c(DepenseSerializer, {'categorie_id': ids[f'CAT_{categorie}'], 'designation': designation,
                                  'montant_total': montant, 'date': date, 'bloc_id': ids[bloc], 'statut': statut})

        # --- Stock : le stock affiché est la somme des mouvements ---
        produits = (
            ('PR1', 'Herbicide', 'Phytosanitaire', 'L', 15000, 50), ('PR2', 'Fongicide', 'Phytosanitaire', 'L', 22000, 40),
            ('PR3', 'Insecticide', 'Phytosanitaire', 'L', 18000, 30), ('PR4', 'Super Gros', 'Engrais', 'kg', 1200, 200),
            ('PR5', 'Pyrical', 'Engrais', 'kg', 2500, 150), ('PR6', 'Fomès', 'Engrais', 'kg', 3000, 100),
            ('PR7', 'Gasoil', 'Carburant', 'L', 850, 500), ('PR8', 'Huile moteur', 'Maintenance', 'L', 5000, 20),
        )
        for key, nom, categorie, unite, prix, minimum in produits:
            ids[key] = c(ProduitSerializer, {'nom': nom, 'categorie': categorie, 'unite': unite,
                                             'prix_unitaire': prix, 'stock_minimum': minimum}).pk
        mouvements = (
            ('PR1', 'ENTREE', 200, '2025-09-01', 'Réception fournisseur', 'B1'), ('PR1', 'SORTIE', 80, '2025-09-10', 'Traitement Bloc A3', 'B3'),
            ('PR2', 'ENTREE', 80, '2025-08-20', 'Réception fongicide', 'B4'), ('PR2', 'SORTIE', 35, '2025-09-14', 'Fongicide Bloc B2', 'B5'),
            ('PR3', 'ENTREE', 100, '2025-09-08', 'Réception insecticide', 'B4'), ('PR3', 'SORTIE', 20, '2025-09-16', 'Traitement Bloc B1', 'B4'),
            ('PR4', 'ENTREE', 1000, '2025-09-03', 'Réception engrais', 'B1'), ('PR4', 'SORTIE', 500, '2025-09-12', 'Épandage Bloc A1', 'B1'),
            ('PR5', 'ENTREE', 300, '2025-08-25', 'Réception engrais', 'B6'), ('PR5', 'SORTIE', 120, '2025-09-15', 'Épandage Bloc C1', 'B6'),
            ('PR6', 'ENTREE', 100, '2025-08-25', 'Réception engrais', 'B6'), ('PR6', 'SORTIE', 65, '2025-09-18', 'Fomès Bloc C2', 'B7'),
            ('PR7', 'ENTREE', 3000, '2025-09-05', 'Livraison gasoil', 'B1'), ('PR7', 'SORTIE', 1000, '2025-09-07', 'Plein tracteurs', 'B1'),
            ('PR8', 'ENTREE', 60, '2025-08-10', 'Réception huile', 'B4'),
        )
        for produit, type_mouvement, quantite, date, motif, bloc in mouvements:
            c(MouvementStockSerializer, {'produit_id': ids[produit], 'type_mouvement': type_mouvement, 'quantite': quantite,
                                         'date': date, 'motif': motif, 'bloc_id': ids[bloc]})

        # --- Rémunérations : août entièrement payé (paiements groupés), septembre en cours ---
        salaires = ((1, 150000), (2, 60000), (3, 60000), (4, 50000), (5, 90000), (6, 70000), (8, 85000),
                    (9, 150000), (10, 60000), (13, 90000), (14, 60000), (15, 70000), (17, 90000), (18, 60000))
        for periode in ('2025-08', '2025-09'):
            for p, brut in salaires:
                c(SalaireSerializer, {'personne_id': ids[f'PERS{p}'], 'periode': periode, 'montant_brut': brut, 'montant_ponction': 0})
        brut_par_personne = dict(salaires)
        for key, _, _, _, membres in equipes:
            lignes = [{'personne_id': ids[f'PERS{m}'], 'montant': brut_par_personne[m]} for m in membres if m in brut_par_personne]
            c(PaiementGroupeSerializer, {'equipe_id': ids[key], 'periode': '2025-08', 'date': '2025-08-30',
                                         'type_paiement': 'ESPECES', 'lignes': lignes})
        for p, montant in ((1, 150000), (2, 60000), (3, 30000), (5, 90000), (6, 35000), (8, 85000), (9, 100000),
                           (13, 90000), (14, 60000), (15, 40000), (17, 90000)):
            c(PaiementSalaireSerializer, {'personne_id': ids[f'PERS{p}'], 'periode': '2025-09', 'montant': montant,
                                          'date': '2025-09-30', 'type_paiement': 'ESPECES'})

        # --- Achats aux particuliers (créent aussi les dépenses correspondantes) ---
        achats = (
            ("N'Guessan François", '07 21 23 45 67', 'Bois de chauffe', 100, 1250, '2025-09-10', 'B1', 125000),
            ('Brou Émilie', '07 22 34 56 78', 'Régimes de palmier', 340, 250, '2025-09-12', 'B4', 50000),
            ('Yapi Laurent', '07 23 45 67 89', 'Bois de chauffe', 48, 1250, '2025-09-15', 'B6', 0),
            ('Adjoumani Grace', '07 24 56 78 90', 'Régimes de palmier', 380, 250, '2025-09-18', 'B2', 95000),
        )
        for nom, tel, produit, poids, prix, date, bloc, verse in achats:
            c(AchatParticulierSerializer, {
                'particulier_nom': nom, 'particulier_telephone': tel, 'designation': produit, 'poids': poids,
                'unite_poids': 'kg', 'prix_unitaire': prix, 'date_achat': date, 'bloc_id': ids[bloc], 'montant_verse': verse,
            })

        # --- Prévisions de septembre (le réalisé est calculé à partir des dépenses) ---
        for categorie, montant in (('Travaux agricoles', 1200000), ('Produits phytosanitaires', 300000), ('Carburant', 200000),
                                   ('Équipements', 150000), ('Maintenance', 80000), ('Communication', 30000), ('Autres', 50000)):
            c(PrevisionSerializer, {'campement_id': ids['C1'] if categorie != 'Maintenance' else ids['C2'],
                                    'categorie_id': ids[f'CAT_{categorie}'], 'periode': '2025-09', 'montant_prevu': montant})
        c(PrevisionSerializer, {'campement_id': ids['C1'], 'categorie_id': ids['CAT_ACHAT'], 'periode': '2025-09', 'montant_prevu': 250000})

        # --- États finaux : personnes sorties, campement fermé ---
        for p in (7, 20):
            c(PersonneSerializer, {'actif': False}, instance=Personne.objects.get(pk=ids[f'PERS{p}']))
        c(BlocSerializer, {'actif': False}, instance=Bloc.objects.get(pk=ids['B9']))

        # --- Comptes utilisateurs ---
        roles = {
            RoleUtilisateur.BIG_BOSS: RoleUtilisateur.objects.create(code=RoleUtilisateur.BIG_BOSS, libelle='Big Boss',
                                                                     description='Accès complet, administration'),
            RoleUtilisateur.SUPERVISEUR: RoleUtilisateur.objects.create(code=RoleUtilisateur.SUPERVISEUR, libelle='Superviseur',
                                                                        description='Saisie des opérations de terrain'),
        }
        c(UtilisateurSerializer, {'personne_id': ids['ADMIN'], 'email': 'admin@allakro.com', 'role': roles['big_boss'].code,
                                  'password': options['admin_password']})
        c(UtilisateurSerializer, {'personne_id': ids['PERS1'], 'email': 'k.jean@allakro.com', 'role': roles['superviseur'].code,
                                  'password': options['superviseur_password']})

        self.stdout.write(self.style.SUCCESS(
            f"Données chargées : {Plantation.objects.count()} plantations, {Campement.objects.count()} campements, "
            f"{Bloc.objects.count()} blocs, {Personne.objects.count()} personnes, {Equipe.objects.count()} équipes, "
            f"{Travail.objects.count()} travaux, {Depense.objects.count()} dépenses, {Salaire.objects.count()} rémunérations, "
            f"{PaiementSalaire.objects.count()} paiements, {AchatParticulier.objects.count()} achats, "
            f"{MouvementStock.objects.count()} mouvements de stock."
        ))
        self.stdout.write(f"Connexion Big Boss   : admin@allakro.com / {options['admin_password']}")
        self.stdout.write(f"Connexion superviseur : k.jean@allakro.com / {options['superviseur_password']}")

    def vider(self):
        self.stdout.write('Suppression des données existantes...')
        Campement.objects.update(responsable=None)
        for model in MODELES_A_VIDER:
            model.objects.all().delete()
        Personne.objects.all().delete()
        Bloc.objects.all().delete()
        Campement.objects.all().delete()
        Plantation.objects.all().delete()
