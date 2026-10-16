"""
Charge un jeu de données réaliste dans la base (PostgreSQL).

    python manage.py seed_allakro            # base vide uniquement
    python manage.py seed_allakro --reset    # efface les données métier puis recharge

Toutes les données passent par les serializers de l'API : mêmes validations et mêmes calculs
(codes automatiques, montants, équipes créées avec les travaux, rémunérations, avances, paiements et leurs dépenses...).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Journal, RoleUtilisateur, TentativeConnexion, Utilisateur
from apps.accounts.serializers import UtilisateurSerializer
from apps.achats.models import AchatParticulier, PaiementAchat, Particulier
from apps.achats.serializers import AchatParticulierSerializer
from apps.core import services
from apps.core.models import (
    AffectationEquipeBloc, Bloc, Campement, Equipe, Fonction, MembreEquipe, Personne, PersonneFonction, Plantation,
)
from apps.core.serializers import BlocSerializer, CampementSerializer, FonctionSerializer, PersonneSerializer, PlantationSerializer
from apps.exploitation.activites import installer_activites
from apps.exploitation.models import Travail, TravailParticipant, TypeTravail
from apps.exploitation.serializers import TravailSerializer
from apps.finances.models import (
    BilanMensuel, CategorieDepense, Depense, LigneSalaire, PaiementSalaire, Prevision, RegleRemuneration, Salaire, Tiers,
)
from apps.finances.serializers import (
    CategorieDepenseSerializer, DepenseSerializer, PaiementLotSerializer, PaiementSalaireSerializer,
    SalaireSerializer,
)
from apps.stock.models import MouvementStock, Produit
from apps.stock.serializers import MouvementStockSerializer, ProduitSerializer

# Ordre de suppression compatible avec les clés étrangères protégées
MODELES_A_VIDER = [
    Journal, TentativeConnexion, Utilisateur, RoleUtilisateur,
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
        parser.add_argument('--admin-password', default='Allakro@2025', help='Mot de passe du compte Super admin.')
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
        aujourd_hui = timezone.localdate()
        jour = lambda decalage: (aujourd_hui + timedelta(days=decalage)).isoformat()  # noqa: E731

        # --- Exploitation : plantations, campements, blocs (avec leur nombre de plantes) ---
        for key, nom, superficie in (('P1', 'ALLAKRO Nord', 1250), ('P2', 'ALLAKRO Sud', 980), ('P3', 'ALLAKRO Centre', 750)):
            ids[key] = c(PlantationSerializer, {'nom': nom, 'localisation': "Côte d'Ivoire", 'superficie': superficie}).pk
        campements = (('C1', 'Campement Nord', 'P1', 450), ('C2', 'Campement Sud', 'P2', 380),
                      ('C3', 'Campement Central', 'P3', 320), ('C4', 'Campement Est', 'P1', 280),
                      ('C5', 'Campement Ouest', 'P2', 220))
        # Un campement a toujours un responsable : le Super admin (compte créé plus bas) tient ce rôle en attendant ; Jean Kouassi
        # (superviseur) prend ensuite « Campement Nord ». Écriture directe : les comptes n'existent pas encore.
        admin = Personne.objects.create(nom='ALLAKRO', prenom='Admin', date_embauche='2023-01-01')
        ids['ADMIN'] = admin.pk
        for key, nom, plantation, superficie in campements:
            ids[key] = Campement.objects.create(nom=nom, plantation_id=ids[plantation], superficie=superficie, responsable=admin).pk
        # Palmier à huile : environ 143 plants par hectare ; hévéa : environ 550
        blocs = (('B1', 'Bloc A1', 'C1', 45, 143), ('B2', 'Bloc A2', 'C1', 38, 143), ('B3', 'Bloc A3', 'C1', 52, 143),
                 ('B4', 'Bloc B1', 'C2', 41, 550), ('B5', 'Bloc B2', 'C2', 36, 550), ('B6', 'Bloc C1', 'C3', 48, 550),
                 ('B7', 'Bloc C2', 'C3', 33, 550), ('B8', 'Bloc D1', 'C4', 29, 143), ('B9', 'Bloc D2', 'C4', 31, 143),
                 ('B10', 'Bloc E1', 'C5', 25, 143))
        for key, nom, campement, superficie, densite in blocs:
            ids[key] = c(BlocSerializer, {'nom': nom, 'campement_id': ids[campement], 'superficie': superficie,
                                          'nombre_plantes': superficie * densite}).pk

        # --- Personnel : chaque personne est affectée à un bloc ---
        for key, libelle in (('F_CC', 'Chef de campement'), ('F_CE', "Chef d'équipe"), ('F_OA', 'Ouvrier agricole'),
                             ('F_TR', 'Tractoriste'), ('F_PU', 'Pulvérisateur'), ('F_MA', 'Manœuvre'), ('F_DI', 'Direction'),
                             ('F_SA', 'Saigneur'), ('F_CH', 'Chef de chantier')):
            ids[key] = c(FonctionSerializer, {'libelle': libelle}).pk

        personnes = (
            ('Kouassi', 'Jean', '07 01 23 45 67', 'F_CC', 'B1', '2023-01-15'),
            ('Diabaté', 'Sékou', '07 02 34 56 78', 'F_OA', 'B1', '2023-01-20'),
            ('Bamba', 'Ibrahim', '07 03 45 67 89', 'F_OA', 'B1', '2023-02-01'),
            ('Touré', 'Aminata', '07 04 56 78 90', 'F_MA', 'B1', '2023-02-15'),
            ('Koné', 'Adama', '07 05 67 89 01', 'F_CE', 'B2', '2023-01-25'),
            ('Cissé', 'Mariam', '07 06 78 90 12', 'F_PU', 'B2', '2023-03-01'),
            ('Yao', 'Kouassi', '07 07 89 01 23', 'F_OA', 'B2', '2023-03-10'),
            ('Brou', 'Franck', '07 08 90 12 34', 'F_TR', 'B3', '2023-04-01'),
            ('Traoré', 'Moussa', '07 09 01 23 45', 'F_CC', 'B4', '2023-01-30'),
            ('Diallo', 'Fatou', '07 10 12 34 56', 'F_OA', 'B4', '2023-02-20'),
            ('Sangaré', 'Ousmane', '07 11 23 45 67', 'F_PU', 'B5', '2023-03-15'),
            ('Coulibaly', 'Awa', '07 12 34 56 78', 'F_MA', 'B5', '2023-04-10'),
            ("N'Guessan", 'Brice', '07 13 45 67 89', 'F_SA', 'B6', '2023-02-05'),
            ('Ouattara', 'Lassina', '07 14 56 78 90', 'F_SA', 'B6', '2023-03-01'),
            ('Koffi', 'Marie', '07 15 67 89 01', 'F_SA', 'B6', '2023-04-15'),
            ('Ahoua', 'Christophe', '07 16 78 90 12', 'F_SA', 'B7', '2023-05-01'),
            ('Zadi', 'Paul', '07 17 89 01 23', 'F_CH', 'B8', '2023-03-20'),
            ('Bakayoko', 'Yacouba', '07 18 90 12 34', 'F_OA', 'B8', '2023-04-20'),
            ('Gnagne', 'Auguste', '07 19 01 23 45', 'F_MA', 'B8', '2023-05-10'),
            ('Tiémoko', 'Adama', '07 20 12 34 56', 'F_OA', 'B9', '2023-06-01'),
        )
        for i, (nom, prenom, tel, fonction, bloc, embauche) in enumerate(personnes, start=1):
            ids[f'P{i}'] = c(PersonneSerializer, {
                'nom': nom, 'prenom': prenom, 'telephone': tel, 'fonction_id': ids[fonction],
                'bloc_id': ids[bloc], 'date_embauche': embauche,
            }).pk
        services.definir_fonction(admin, Fonction.objects.get(pk=ids['F_DI']), admin.date_embauche)
        # Le superviseur de démonstration (Jean Kouassi, compte créé plus bas) est responsable de « Campement Nord » ;
        # les autres campements restent au Super admin. Jean n'est plus rattaché à un bloc : il gère tous ceux de son campement.
        Campement.objects.filter(pk=ids['C1']).update(responsable_id=ids['P1'])
        Personne.objects.filter(pk=ids['P1']).update(bloc=None, campement_id=ids['C1'])

        # --- Activités (liste officielle) ---
        installer_activites(TypeTravail)
        activites = {t.libelle: t.pk for t in TypeTravail.objects.all()}

        # --- Travaux : équipe + chef si plusieurs personnes, responsable si une seule ; avance éventuelle ---
        P = lambda *numeros: [ids[f'P{n}'] for n in numeros]  # noqa: E731
        travaux = (
            # clé, activité, précision, bloc, début, fin, unité, quantité, prix, personnes, chef, équipe, avance
            ('T1', 'OUVERTURES', '', 'B1', '2025-09-01', '2025-09-05', 'ha', 45, 5000, P(1, 2, 3, 4), 'P1', 'Équipe Alpha', None),
            ('T2', 'RABATAGE', '', 'B2', '2025-09-03', '2025-09-08', 'ha', 38, 5000, P(5, 6, 7), 'P5', 'Équipe Bravo',
             {'montant': 50000, 'date': '2025-09-03'}),
            ('T3', 'PLANTING', '', 'B3', '2025-09-05', '2025-09-20', 'plantes', 2000, 150, P(8), None, '', None),
            ('T4', 'PIQUETAGE', '', 'B4', '2025-09-08', '2025-09-12', 'ha', 41, 4000, P(9, 10), 'P9', 'Équipe Charlie', None),
            ('T5', 'SAIGNEE', '', 'B6', '2025-09-10', '2025-09-30', 'kg', 300, 250, P(13, 14, 15), 'P13', 'Saigneurs C1', None),
            ('T6', 'SAIGNEE', '', 'B7', '2025-09-12', '2025-09-25', 'kg', 80, 250, P(16), None, '', None),
            ('T7', 'TRAITEMENT', '', 'B5', '2025-08-20', '2025-08-25', 'litre', 120, 500, P(11, 12), 'P11', 'Équipe Traitement B2', None),
            ('T8', 'AUTRE', 'Trouaison', 'B6', '2025-08-22', '2025-08-30', 'plantes', 500, 200, P(13, 14), 'P14', 'Équipe Delta', None),
            ('T9', 'DEFRICHAGE', '', 'B8', '2025-07-05', '2025-07-15', 'ha', 29, 3000, P(17, 18, 19), 'P17', 'Équipe Echo', None),
            ('T10', 'RAMASSAGE', '', 'B1', '2025-07-10', '2025-07-12', 'kg', 500, 100, P(2), None, '', None),
            ('T11', 'GREFFAGE', '', 'B2', jour(-3), jour(5), 'plantes', 300, 100, P(5, 6), 'P6', 'Greffeurs A2',
             {'montant': 10000, 'date': jour(-3)}),
            ('T12', 'ROUTE', '', 'B4', jour(7), jour(14), 'jours', 10, 3000, P(10), None, '', None),
            ('T13', 'TAPAGE', '', 'B3', jour(2), jour(4), 'ha', 5, 2000, P(8), None, '', None),
        )
        for key, activite, precision, bloc, debut, fin, unite, quantite, prix, membres, chef, equipe, avance in travaux:
            donnees = {
                'type_travail_id': activites[activite], 'activite_autre': precision, 'bloc_id': ids[bloc],
                'date_travail': debut, 'date_fin': fin, 'unite': unite, 'quantite': quantite, 'prix_unitaire': prix,
                'personnes_ids': membres,
            }
            if chef:
                donnees.update({'chef_id': ids[chef], 'equipe_nom': equipe})
            if avance:
                donnees['avance'] = {**avance, 'type_paiement': 'ESPECES'}
            ids[key] = c(TravailSerializer, donnees).pk
        # Travail annulé avant de commencer
        Travail.objects.filter(pk=ids['T13']).update(statut=Travail.Statut.ANNULE)
        remuneration = lambda cle: Salaire.objects.get(travail_id=ids[cle]).pk  # noqa: E731

        # --- Dépenses saisies directement ---
        for libelle in ('Travaux agricoles', 'Produits phytosanitaires', 'Carburant', 'Équipements', 'Maintenance',
                        'Communication', 'Autres'):
            ids[f'CAT_{libelle}'] = c(CategorieDepenseSerializer, {'libelle': libelle}).pk
        ids['CAT_ACHAT'] = CategorieDepense.achat_particuliers().pk
        CategorieDepense.salaires()
        depenses = (
            ('Carburant', 'Gasoil tracteur', 85000, '2025-09-07', 'B1', 'PAYEE'),
            ('Produits phytosanitaires', 'Herbicide Bloc A3', 120000, '2025-09-10', 'B3', 'PAYEE'),
            ('Maintenance', 'Réparation pulvérisateur', 45000, '2025-09-12', 'B4', 'PAYEE'),
            ('Équipements', 'Achat débroussailleuse', 180000, '2025-09-15', 'B4', 'NON_PAYEE'),
            ('Travaux agricoles', 'Location tracteur Bloc A3', 160000, '2025-09-15', 'B3', 'PARTIELLE'),
            ('Carburant', 'Essence groupe électrogène', 60000, '2025-09-18', 'B6', 'PAYEE'),
            ('Communication', 'Crédit téléphone superviseurs', 25000, '2025-09-20', 'B6', 'PAYEE'),
            ('Produits phytosanitaires', 'Fongicide Bloc B2', 95000, '2025-09-14', 'B5', 'PAYEE'),
            ('Autres', 'Fournitures bureau', 15000, '2025-09-25', 'B6', 'PAYEE'),
            ('Carburant', 'Gasoil mois août', 110000, '2025-08-15', 'B1', 'PAYEE'),
            ('Produits phytosanitaires', 'Insecticide Bloc A1', 75000, '2025-08-10', 'B1', 'PAYEE'),
            ('Maintenance', 'Entretien tracteur', 70000, '2025-08-18', 'B4', 'PAYEE'),
            ('Carburant', 'Gasoil juillet', 95000, '2025-07-15', 'B1', 'PAYEE'),
            ('Équipements', 'Achat pioches', 95000, '2025-07-10', 'B6', 'PAYEE'),
        )
        for categorie, designation, montant, date, bloc, _ in depenses:  # le statut d'une dépense saisie est toujours « Payée »
            c(DepenseSerializer, {'categorie_id': ids[f'CAT_{categorie}'], 'designation': designation,
                                  'montant_total': montant, 'date': date, 'bloc_id': ids[bloc]})

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

        # --- Rémunérations manuelles (salaires mensuels des chefs de campement) ---
        for cle, personne, periode, brut in (('S1', 'P1', '2025-08', 150000), ('S2', 'P1', '2025-09', 150000),
                                            ('S3', 'P9', '2025-09', 150000)):
            ids[cle] = c(SalaireSerializer, {'personne_id': ids[personne], 'periode': periode, 'montant_brut': brut,
                                             'libelle': f"Salaire chef de campement {periode[5:]}/{periode[:4]}"}).pk

        # --- Paiements : via le chef d'équipe, via un membre, personne seule, en deux fois, groupé ---
        paiements = (
            ('T1', 225000, '2025-09-06', 'P1'),       # équipe payée via son chef (100 %)
            ('T3', 300000, '2025-09-21', 'P8'),       # personne seule
            ('T5', 75000, '2025-09-30', 'P13'),       # 3 saigneurs : 300 kg payés via le chef
            ('T6', 20000, '2025-09-26', 'P16'),       # 80 kg : une seule personne
            ('T7', 60000, '2025-08-26', 'P12'),       # payé via un membre de l'équipe
            ('T9', 50000, '2025-07-16', 'P17'),       # payé en deux fois
            ('T9', 37000, '2025-07-31', 'P17'),
            ('T10', 50000, '2025-07-13', 'P2'),
        )
        for cle, montant, date, beneficiaire in paiements:
            c(PaiementSalaireSerializer, {'salaire_id': remuneration(cle), 'montant': montant, 'date': date,
                                          'type_paiement': 'ESPECES', 'beneficiaire_id': ids[beneficiaire]})
        c(PaiementSalaireSerializer, {'salaire_id': ids['S1'], 'montant': 150000, 'date': '2025-08-31',
                                      'type_paiement': 'VIREMENT'})
        c(PaiementSalaireSerializer, {'salaire_id': ids['S3'], 'montant': 100000, 'date': '2025-09-30',
                                      'type_paiement': 'MOBILE_MONEY'})
        # Nouveau paiement groupé : travail de son équipe + reste de son salaire, payés ensemble à Moussa Traoré
        c(PaiementLotSerializer, {'beneficiaire_id': ids['P9'], 'date': '2025-10-02', 'type_paiement': 'ESPECES',
                                  'reference': 'Paie septembre', 'lignes': [
                                      {'salaire_id': remuneration('T4'), 'montant': 164000},
                                      {'salaire_id': ids['S3'], 'montant': 50000}]})

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

        # --- États finaux : personnes sorties, bloc fermé ---
        for p in (7, 20):
            c(PersonneSerializer, {'actif': False}, instance=Personne.objects.get(pk=ids[f'P{p}']))
        c(BlocSerializer, {'actif': False}, instance=Bloc.objects.get(pk=ids['B9']))

        # --- Comptes utilisateurs ---
        roles = {
            RoleUtilisateur.BIG_BOSS: RoleUtilisateur.objects.create(code=RoleUtilisateur.BIG_BOSS, libelle='Super admin',
                                                                     description='Accès complet, administration'),
            RoleUtilisateur.SUPERVISEUR: RoleUtilisateur.objects.create(code=RoleUtilisateur.SUPERVISEUR, libelle='Superviseur',
                                                                        description='Saisie des opérations de terrain'),
        }
        c(UtilisateurSerializer, {'personne_id': ids['ADMIN'], 'email': 'admin@allakro.com', 'role': roles['big_boss'].code,
                                  'password': options['admin_password']})
        c(UtilisateurSerializer, {'personne_id': ids['P1'], 'email': 'k.jean@allakro.com', 'role': roles['superviseur'].code,
                                  'password': options['superviseur_password']})

        self.stdout.write(self.style.SUCCESS(
            f"Données chargées : {Plantation.objects.count()} plantations, {Campement.objects.count()} campements, "
            f"{Bloc.objects.count()} blocs, {Personne.objects.count()} personnes, {Travail.objects.count()} travaux, "
            f"{Equipe.objects.count()} équipes, {Salaire.objects.count()} rémunérations, "
            f"{PaiementSalaire.objects.count()} paiements, {Depense.objects.count()} dépenses, "
            f"{AchatParticulier.objects.count()} achats, {MouvementStock.objects.count()} mouvements de stock."
        ))
        self.stdout.write(f"Connexion Super admin   : admin@allakro.com / {options['admin_password']}")
        self.stdout.write(f"Connexion superviseur : k.jean@allakro.com / {options['superviseur_password']}")

    def vider(self):
        self.stdout.write('Suppression des données existantes...')
        Personne.objects.update(bloc=None, campement=None)  # casse le cycle personne <-> campement (responsable) avant les suppressions
        for model in MODELES_A_VIDER:
            model.objects.all().delete()
        Bloc.objects.all().delete()
        Campement.objects.all().delete()
        Personne.objects.all().delete()
        Plantation.objects.all().delete()
